// Cloudflare Worker: Twitch sleep-status proxy
// Set secrets (wrangler secret put ...):
//   TWITCH_CLIENT_ID
//   TWITCH_CLIENT_SECRET
// Configuration: adjust CHANNEL and SLEEP_GAME if needed.

const CHANNEL = "vedal987";
const SLEEP_GAME = "I'm Only Sleeping";

let tokenCache = { token: null, expiresAt: 0 };

async function getAppToken(env) {
  const now = Date.now();
  if (tokenCache.token && tokenCache.expiresAt - 60000 > now) {
    return tokenCache.token;
  }
  const params = new URLSearchParams({
    client_id: env.TWITCH_CLIENT_ID,
    client_secret: env.TWITCH_CLIENT_SECRET,
    grant_type: "client_credentials"
  });
  const resp = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    body: params
  });
  if (!resp.ok) throw new Error(`Token HTTP ${resp.status}`);
  const json = await resp.json();
  tokenCache = {
    token: json.access_token,
    expiresAt: now + (json.expires_in || 3600) * 1000
  };
  return tokenCache.token;
}

async function fetchStream(env) {
  const token = await getAppToken(env);
  const url = `https://api.twitch.tv/helix/streams?user_login=${CHANNEL}`;
  const resp = await fetch(url, {
    headers: {
      "Client-ID": env.TWITCH_CLIENT_ID,
      Authorization: `Bearer ${token}`
    }
  });
  if (!resp.ok) throw new Error(`Streams HTTP ${resp.status}`);
  const json = await resp.json();
  return json.data && json.data[0];
}

export default {
  async fetch(request, env) {
    try {
      const stream = await fetchStream(env);
      const live = !!stream && stream.type === "live";
      const game = stream?.game_name || "";
      const isSleeping = live && game === SLEEP_GAME;

      const body = JSON.stringify({
        isSleeping,
        live,
        game_name: game,
        title: stream?.title || ""
      });

      return new Response(body, {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "public, max-age=60"
        }
      });
    } catch (err) {
      const body = JSON.stringify({ error: err.message || "unknown error" });
      return new Response(body, {
        status: 502,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-store"
        }
      });
    }
  }
};
