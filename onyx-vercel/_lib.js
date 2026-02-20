/**
 * Onyx – shared utilities for all API routes.
 * Uses @vercel/kv (Redis) instead of Cloudflare KV.
 *
 * KV namespaces map:
 *   CF KEYS     → kv prefix "key:" / "wl:" / "bl:"
 *   CF CLAIMS   → kv prefix "claim:"
 *   CF NAMETAGS → kv prefix "nametag:"
 *   CF ONYX_USERS → kv prefix "active:" (with TTL via EXPIRE)
 */

const { kv } = require("@vercel/kv");

// ── CORS headers ──────────────────────────────────────────────────────────────
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-server-secret",
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function now() {
  return Math.floor(Date.now() / 1000);
}

function generateKey() {
  const hex4 = () => Math.random().toString(16).slice(2, 6).toUpperCase().padStart(4, "0");
  return `ONYX-${hex4()}${hex4()}-${hex4()}${hex4()}-${hex4()}${hex4()}`;
}

function verifySecret(req) {
  const incoming = (req.headers["x-server-secret"] || "").trim();
  return incoming === (process.env.SERVER_SECRET || "").trim();
}

function sendJson(res, data, status = 200) {
  res.status(status).setHeader("Content-Type", "application/json");
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  res.end(JSON.stringify(data));
}

function sendCors(res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  res.status(204).end();
}

async function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve({});
      }
    });
  });
}

// ── KV wrappers (mirrors CF KV API) ──────────────────────────────────────────

/** Get a JSON value. Returns null if missing. */
async function kvGet(key) {
  try {
    return await kv.get(key); // @vercel/kv auto JSON-parses
  } catch {
    return null;
  }
}

/** Set a JSON value, with optional TTL in seconds. */
async function kvSet(key, value, ttlSeconds) {
  if (ttlSeconds) {
    await kv.set(key, value, { ex: ttlSeconds });
  } else {
    await kv.set(key, value);
  }
}

/** Delete a key. */
async function kvDel(key) {
  await kv.del(key);
}

/**
 * List all keys with a given prefix.
 * Returns array of full key strings.
 * Uses SCAN internally (handles large sets).
 */
async function kvList(prefix) {
  const keys = [];
  let cursor = 0;
  do {
    const [nextCursor, batch] = await kv.scan(cursor, { match: `${prefix}*`, count: 200 });
    keys.push(...batch);
    cursor = parseInt(nextCursor, 10);
  } while (cursor !== 0);
  return keys;
}

module.exports = { CORS, now, generateKey, verifySecret, sendJson, sendCors, readBody, kvGet, kvSet, kvDel, kvList };
