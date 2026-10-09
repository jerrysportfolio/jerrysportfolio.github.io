// Cloudflare Worker: returns the last 14 days of unique visitors from Cloudflare's
// GraphQL Analytics API. The API token stays here as a secret, never in the page.
//
// Secrets / vars (see worker/README.md):
//   CF_API_TOKEN  secret  token with "Zone > Analytics > Read"
//   CF_ZONE_ID    var     zone id of iamjerryhu.org
//   ALLOWED_ORIGIN var    https://portfolio.iamjerryhu.org
//   SLEEP_TOKEN    secret  shared secret the iOS Shortcut sends to POST /sleep

const QUERY = `
query($zone: String!, $from: Date!, $to: Date!) {
  viewer {
    zones(filter: { zoneTag: $zone }) {
      httpRequests1dGroups(limit: 31, orderBy: [date_ASC], filter: { date_geq: $from, date_leq: $to }) {
        dimensions { date }
        uniq { uniques }
      }
    }
  }
}`;

// Hourly buckets, so days can be cut in the site owner's time zone instead of UTC.
const QUERY_HOURLY = `
query($zone: String!, $from: Time!) {
  viewer {
    zones(filter: { zoneTag: $zone }) {
      httpRequests1hGroups(limit: 500, orderBy: [datetime_ASC], filter: { datetime_geq: $from }) {
        dimensions { datetime }
        uniq { uniques }
      }
    }
  }
}`;

// "Today" and the day buckets follow this zone (the owner's), not UTC.
const TZ = "America/Chicago";
const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const localDate = (ms) => dayFmt.format(ms); // YYYY-MM-DD in TZ

// Live presence: every open tab holds a WebSocket to this one Durable Object, and the
// "online now" number is the count of open sockets. Counts every connection (no dedupe),
// so it errs on the high side. Uses WebSocket hibernation, so idle tabs cost nothing.
export class Presence {
  constructor(state) {
    this.state = state;
    // Answered by the runtime without waking the object.
    state.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async fetch(request) {
    if (request.headers.get("Upgrade") !== "websocket") return new Response("Expected websocket", { status: 426 });
    const [client, server] = Object.values(new WebSocketPair());
    this.state.acceptWebSocket(server);
    this.broadcast();
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketClose(ws, code) {
    try { ws.close(code); } catch {}
    this.broadcast();
  }

  webSocketError() {
    this.broadcast();
  }

  broadcast() {
    const open = this.state.getWebSockets().filter((w) => w.readyState === 1);
    const msg = JSON.stringify({ online: open.length });
    for (const w of open) { try { w.send(msg); } catch {} }
  }
}

// Sleep data pushed from an iOS Shortcut (Apple Health). One object holds a {date: hours} map
// (nightly totals only, no bed/wake times) and keeps the most recent 30 nights.
export class Sleep {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    const nights = (await this.state.storage.get("nights")) || {};
    if (request.method === "POST") {
      const body = await request.json();
      for (const n of body.nights) nights[n.date] = Math.round(n.hours * 100) / 100;
      const keep = Object.keys(nights).sort().slice(-30);
      const trimmed = Object.fromEntries(keep.map((d) => [d, nights[d]]));
      await this.state.storage.put("nights", trimmed);
      return new Response(JSON.stringify({ ok: true, stored: keep.length }));
    }
    return new Response(JSON.stringify(nights));
  }
}

// Origins allowed to read data / open the live socket: the site, plus the local preview server.
const originOk = (origin, env) => [env.ALLOWED_ORIGIN, "http://localhost:8000", "http://127.0.0.1:8000"].includes(origin);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/live") {
      if (request.headers.get("Upgrade") !== "websocket") return new Response("Expected websocket", { status: 426 });
      if (!originOk(request.headers.get("Origin"), env)) return new Response("Forbidden", { status: 403 });
      return env.PRESENCE.get(env.PRESENCE.idFromName("site")).fetch(request);
    }

    if (url.pathname === "/sleep") return handleSleep(request, env);

    const origin = request.headers.get("Origin") || "";
    const cors = {
      "Access-Control-Allow-Origin": originOk(origin, env) ? origin : env.ALLOWED_ORIGIN,
      "Vary": "Origin",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    // Cache at the edge for 5 min: analytics lag anyway, and it protects the API quota.
    const cache = caches.default;
    const cacheKey = new Request(new URL(request.url).origin + "/visitors");
    const hit = await cache.match(cacheKey);
    if (hit) return withHeaders(hit, cors);

    // Days are cut in TZ (see above). Hourly rows are summed per local day; Cloudflare only
    // exposes uniques per bucket, so a visitor active in several hours counts once per hour
    // and the daily figure runs a little high. If the hourly query fails, fall back to
    // Cloudflare's own UTC daily buckets.
    const DAYS = 14;
    const dates = Array.from({ length: DAYS }, (_, i) => localDate(Date.now() - (DAYS - 1 - i) * 864e5));
    const to = dates[DAYS - 1];
    const gql = (query, variables) => fetch("https://api.cloudflare.com/client/v4/graphql", {
      method: "POST",
      headers: { "Authorization": `Bearer ${env.CF_API_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables: { zone: env.CF_ZONE_ID, ...variables } }),
    });

    let byDate = null;
    const hres = await gql(QUERY_HOURLY, { from: new Date(Date.now() - (DAYS + 1) * 864e5).toISOString() });
    if (hres.ok) {
      const rows = (await hres.json())?.data?.viewer?.zones?.[0]?.httpRequests1hGroups;
      if (rows) {
        byDate = {};
        for (const r of rows) {
          const d = localDate(Date.parse(r.dimensions.datetime));
          byDate[d] = (byDate[d] || 0) + r.uniq.uniques;
        }
      }
    }
    if (!byDate) {
      const res = await gql(QUERY, { from: dates[0], to });
      if (!res.ok) return json({ error: "upstream" }, 502, cors);
      const groups = (await res.json())?.data?.viewer?.zones?.[0]?.httpRequests1dGroups;
      if (!groups) return json({ error: "no data" }, 502, cors);
      byDate = Object.fromEntries(groups.map((g) => [g.dimensions.date, g.uniq.uniques]));
    }
    // Fill days Cloudflare has no row for with 0 so the chart always spans DAYS points.
    const days = dates.map((date) => ({ date, uniques: byDate[date] ?? 0 }));

    const out = json({ days, uniques: days[days.length - 1].uniques, day: to }, 200, { ...cors, "Cache-Control": "public, max-age=300" });
    ctx.waitUntil(cache.put(cacheKey, out.clone()));
    return out;
  },
};

const json = (body, status, headers) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
const withHeaders = (res, headers) => {
  const r = new Response(res.body, res);
  for (const [k, v] of Object.entries(headers)) r.headers.set(k, v);
  return r;
};

// POST /sleep  (Authorization: Bearer SLEEP_TOKEN)  body: {"nights":[{"date":"2026-10-07","hours":7.4}, ...]}
//   `date` is the morning you woke up. Upserts by date, so re-sending a week is harmless.
// GET  /sleep  -> {"nights":[{"date","hours"|null} x7]}, the last 7 days ending today (America/Chicago), where "today" rolls over at 1pm local.
async function handleSleep(request, env) {
  // The local preview server (python -m http.server 8000) may read the chart data too.
  const origin = request.headers.get("Origin") || "";
  const cors = {
    "Access-Control-Allow-Origin": originOk(origin, env) ? origin : env.ALLOWED_ORIGIN,
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Vary": "Origin",
  };
  if (request.method === "OPTIONS") return new Response(null, { headers: cors });
  const store = env.SLEEP.get(env.SLEEP.idFromName("sleep"));

  if (request.method === "POST") {
    const auth = request.headers.get("Authorization") || "";
    if (!env.SLEEP_TOKEN || !timingSafeEqual(auth, `Bearer ${env.SLEEP_TOKEN}`)) return json({ error: "unauthorized" }, 401, cors);
    let body;
    try { body = await request.json(); } catch { return json({ error: "bad json" }, 400, cors); }
    const nights = body?.nights;
    const valid = Array.isArray(nights) && nights.length > 0 && nights.length <= 31 && nights.every((n) =>
      n && /^\d{4}-\d{2}-\d{2}$/.test(n.date) && typeof n.hours === "number" && n.hours >= 0 && n.hours <= 24);
    if (!valid) return json({ error: "expected {nights:[{date:'YYYY-MM-DD',hours:0-24}]}" }, 400, cors);
    const res = await store.fetch("https://do/sleep", { method: "POST", body: JSON.stringify({ nights }) });
    return new Response(res.body, { status: 200, headers: { "Content-Type": "application/json", ...cors } });
  }

  if (request.method !== "GET") return json({ error: "method" }, 405, cors);
  const stored = await (await store.fetch("https://do/sleep")).json();
  // The sleep "day" rolls over at 1pm (not midnight): last night's data isn't in until midday, so a new
  // empty slot should only appear after that. Shifting "now" back 13h makes 1pm the day boundary.
  const sleepNow = Date.now() - 13 * 36e5;
  const nights = Array.from({ length: 7 }, (_, i) => {
    const date = localDate(sleepNow - (6 - i) * 864e5);
    return { date, hours: stored[date] ?? null };
  });
  return json({ nights }, 200, { ...cors, "Cache-Control": "public, max-age=300" });
}

function timingSafeEqual(a, b) {
  const enc = new TextEncoder();
  const x = enc.encode(a), y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}
