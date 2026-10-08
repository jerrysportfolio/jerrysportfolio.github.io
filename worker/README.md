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
