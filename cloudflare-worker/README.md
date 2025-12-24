# Cloudflare Worker: Twitch Sleep Status Proxy

Proxy the Twitch Helix API to avoid exposing client credentials in the browser. Returns a minimal JSON payload consumed by the dashboard.

## Setup
1. Install Wrangler: `npm install -g wrangler` (or use `npx wrangler`).
2. In this folder, set secrets (no values in git):
   ```
   wrangler secret put TWITCH_CLIENT_ID
   wrangler secret put TWITCH_CLIENT_SECRET
   ```
3. Deploy:
   ```
   wrangler deploy
   ```
   Note the deployed URL (e.g., `https://neuro-sleep-proxy.yourname.workers.dev`).

4. Update your frontend `env.js` to point to the Worker:
   ```js
   window.TWITCH_PROXY_URL = "https://neuro-sleep-proxy.yourname.workers.dev";
   ```

## Behavior
- Fetches an app access token via client credentials, caching until expiry.
- Calls `helix/streams?user_login=vedal987` and reports:
  ```json
  { "isSleeping": true|false, "live": true|false, "game_name": "…", "title": "…" }
  ```
- CORS: `Access-Control-Allow-Origin: *`
- Cached for up to 60s to stay gentle on Twitch rate limits.
