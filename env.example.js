// Copy this file to env.js and set the URL of your Cloudflare Worker proxy.
// The worker should return JSON like: { isSleeping: boolean, live: boolean, game_name: string, title: string }
// Example: https://your-worker.yourname.workers.dev/sleep-status

window.TWITCH_PROXY_URL = "https://your-worker.yourname.workers.dev/sleep-status";
