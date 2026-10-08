// Cloudflare Worker: returns today's unique visitor count from Cloudflare's
// GraphQL Analytics API. The API token stays here as a secret, never in the page.
//
// Secrets / vars (see worker/README.md):
//   CF_API_TOKEN  secret  token with "Zone > Analytics > Read"
//   CF_ZONE_ID    var     zone id of iamjerryhu.org
//   ALLOWED_ORIGIN var    https://portfolio.iamjerryhu.org

const QUERY = `
query($zone: String!, $day: Date!) {
  viewer {
    zones(filter: { zoneTag: $zone }) {
      httpRequests1dGroups(limit: 1, filter: { date: $day }) {
        uniq { uniques }
      }
    }
  }
}`;

export default {
  async fetch(request, env, ctx) {
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

    const day = new Date().toISOString().slice(0, 10); // UTC day, matches Cloudflare's buckets
    const res = await fetch("https://api.cloudflare.com/client/v4/graphql", {
      method: "POST",
      headers: { "Authorization": `Bearer ${env.CF_API_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: QUERY, variables: { zone: env.CF_ZONE_ID, day } }),
    });
    if (!res.ok) return json({ error: "upstream" }, 502, cors);

    const data = await res.json();
    const groups = data?.data?.viewer?.zones?.[0]?.httpRequests1dGroups;
    if (!groups) return json({ error: "no data" }, 502, cors);
    const uniques = groups[0]?.uniq?.uniques ?? 0;

    const out = json({ uniques, day }, 200, { ...cors, "Cache-Control": "public, max-age=300" });
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
