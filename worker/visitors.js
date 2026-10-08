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

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/live") {
      if (request.headers.get("Upgrade") !== "websocket") return new Response("Expected websocket", { status: 426 });
      if (request.headers.get("Origin") !== env.ALLOWED_ORIGIN) return new Response("Forbidden", { status: 403 });
      return env.PRESENCE.get(env.PRESENCE.idFromName("site")).fetch(request);
    }

    if (url.pathname === "/sleep") return handleSleep(request, env);

    const origin = request.headers.get("Origin") || "";
    const cors = {
      "Access-Control-Allow-Origin": origin === env.ALLOWED_ORIGIN ? origin : env.ALLOWED_ORIGIN,
      "Vary": "Origin",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    // Cache at the edge for 5 min: analytics lag anyway, and it protects the API quota.
    const cache = caches.default;
    const cacheKey = new Request(new URL(request.url).origin + "/visitors");
    const hit = await cache.match(cacheKey);
    if (hit) return withHeaders(hit, cors);

    // UTC days, matching Cloudflare's buckets.
    const DAYS = 14;
    const to = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - (DAYS - 1) * 864e5).toISOString().slice(0, 10);
    const res = await fetch("https://api.cloudflare.com/client/v4/graphql", {
      method: "POST",
      headers: { "Authorization": `Bearer ${env.CF_API_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: QUERY, variables: { zone: env.CF_ZONE_ID, from, to } }),
    });
    if (!res.ok) return json({ error: "upstream" }, 502, cors);

    const data = await res.json();
    const groups = data?.data?.viewer?.zones?.[0]?.httpRequests1dGroups;
    if (!groups) return json({ error: "no data" }, 502, cors);
    // Fill days Cloudflare has no row for with 0 so the chart always spans DAYS points.
    const byDate = Object.fromEntries(groups.map((g) => [g.dimensions.date, g.uniq.uniques]));
    const days = Array.from({ length: DAYS }, (_, i) => {
      const date = new Date(Date.parse(from) + i * 864e5).toISOString().slice(0, 10);
      return { date, uniques: byDate[date] ?? 0 };
    });

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
// GET  /sleep  -> {"nights":[{"date","hours"|null} x7]}, the last 7 days ending today (UTC).
async function handleSleep(request, env) {
  const cors = {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN,
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
  const nights = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(Date.now() - (6 - i) * 864e5).toISOString().slice(0, 10);
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
