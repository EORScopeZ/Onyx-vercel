# Onyx Key System — Vercel Migration Guide

## What changed

| Before (Cloudflare) | After (Vercel) |
|---|---|
| `worker.js` (single file) | `api/*.js` (one file per route) |
| Cloudflare KV (4 namespaces) | Vercel KV (single Redis store, prefixed keys) |
| `wrangler.toml` | `vercel.json` |
| `wrangler secret put` | Vercel dashboard env vars |

`bot.js` is **unchanged** — it already reads `KEY_SERVER_URL` from env, so just point it at your new Vercel URL.

---

## Step 1 — Deploy to Vercel

```bash
npm i -g vercel
cd onyx-vercel
vercel deploy --prod
```

Vercel will give you a URL like `https://onyx-key-system.vercel.app`. Save it.

---

## Step 2 — Create a KV store

1. Go to **vercel.com → Storage → Create → KV**
2. Name it anything (e.g. `onyx-kv`)
3. Click **Connect to Project** → select your deployed project
4. Vercel auto-injects `KV_URL`, `KV_REST_API_URL`, `KV_REST_API_TOKEN` into your project env — you don't need to copy them manually

---

## Step 3 — Set environment variables in Vercel

Go to your project → **Settings → Environment Variables** and add:

| Variable | Value |
|---|---|
| `SERVER_SECRET` | Some random secret string |
| `LINKVERTISE_URL` | Your Linkvertise link |

Then **redeploy** so the vars take effect:
```bash
vercel deploy --prod
```

---

## Step 4 — Run the Discord bot

The bot runs separately (e.g. on Railway, a VPS, or your own machine). Create a `.env` file:

```env
BOT_TOKEN=your_discord_bot_token
CLIENT_ID=your_bot_client_id
GUILD_ID=your_guild_id
KEY_SERVER_URL=https://your-app.vercel.app    # ← your Vercel URL
SERVER_SECRET=same_value_as_above
ADMIN_ROLE_ID=...
KEY_CHANNEL_ID=...
PURCHASE_LOG_CHANNEL_ID=...
WHITELIST_LOG_CHANNEL_ID=...
ADMIN_LOG_CHANNEL_ID=...
ROBLOX_GROUP_ID=...
ROBLOX_COOKIE=...
LINKVERTISE_URL=https://linkvertise.com/...
```

Then:
```bash
npm install discord.js node-fetch
node bot.js
```

---

## Step 5 — Update your Lua script

In `Onyx_V2.lua`, change the server URL variable to your Vercel URL:
```lua
local SERVER_URL = "https://your-app.vercel.app"
```

All endpoints are identical — no other Lua changes needed.

---

## Key mapping (CF KV → Vercel KV prefixes)

| CF Namespace | Vercel KV prefix |
|---|---|
| `KEYS` `key:*` | `key:*` |
| `KEYS` `wl:*` | `wl:*` |
| `KEYS` `bl:*` | `bl:*` |
| `CLAIMS` `ip:*` | `claim:ip:*` |
| `NAMETAGS` `config:*` | `nametag:config:*` |
| `ONYX_USERS` `user:*` | `active:user:*` |

---

## Notes

- **IP detection**: Vercel forwards the real IP in `x-forwarded-for` just like Cloudflare, so 48h cooldowns work the same.
- **TTL/auto-expiry**: Vercel KV supports `{ ex: seconds }` natively — heartbeat entries still expire after 15s if the player disconnects.
- **Free tier**: Vercel KV free tier gives 256MB storage and 3,000 req/day. Upgrade to Pro ($20/mo) for higher limits.
