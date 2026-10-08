# Visitor counter Worker

1. Cloudflare dashboard -> your domain -> Overview -> copy the **Zone ID** into `wrangler.toml`.
2. My Profile -> API Tokens -> Create Token -> Custom: **Zone > Analytics > Read**, scoped to your zone.
3. Deploy:
   ```
   cd worker
   npx wrangler secret put CF_API_TOKEN   # paste the token
   npx wrangler deploy
   ```
4. Put the printed `*.workers.dev` URL into `VISITORS_URL` in `assets/js/visitors.js`.

## Sleep card (`/sleep`)

Apple Health has no web API, so an iOS Shortcut pushes nightly totals to the Worker.

1. Pick a long random token and store it: `npx wrangler secret put SLEEP_TOKEN`
2. `npx wrangler deploy` (the `v2` migration creates the `Sleep` Durable Object).
3. Shortcut (Automation -> Time of Day, e.g. 10:00, Run Immediately): Find Health Samples
   (Sleep Analysis, last 7 days; only "Asleep" stages) -> group per wake-up date, sum the
   durations in hours -> Get Contents of URL: `POST https://<worker>/sleep`, header
   `Authorization: Bearer <token>`, JSON body `{"nights":[{"date":"2026-10-07","hours":7.4}]}`.
   Re-sending the same dates is safe (upserts by date).
4. The About page card draws the last 7 nights and hides itself until data exists.
