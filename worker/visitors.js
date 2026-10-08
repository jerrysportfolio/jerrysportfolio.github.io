// Cloudflare Worker: returns the last 14 days of unique visitors from Cloudflare's
// GraphQL Analytics API. The API token stays here as a secret, never in the page.
//
// Secrets / vars (see worker/README.md):
//   CF_API_TOKEN  secret  token with "Zone > Analytics > Read"
//   CF_ZONE_ID    var     zone id of iamjerryhu.org
//   ALLOWED_ORIGIN var    https://portfolio.iamjerryhu.org

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

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/live") {
      if (request.headers.get("Upgrade") !== "websocket") return new Response("Expected websocket", { status: 426 });
      if (request.headers.get("Origin") !== env.ALLOWED_ORIGIN) return new Response("Forbidden", { status: 403 });
      return env.PRESENCE.get(env.PRESENCE.idFromName("site")).fetch(request);
    }

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
