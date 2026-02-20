/**
 * Onyx – shared utilities for all API routes.
 * Uses @upstash/redis (injected by Vercel Upstash integration).
 */

const { Redis } = require("@upstash/redis");

const kv = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-server-secret",
};

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
      try { resolve(JSON.parse(data)); }
      catch { resolve({}); }
    });
  });
}

async function kvGet(key) {
  try { return await kv.get(key); }
  catch { return null; }
}

async function kvSet(key, value, ttlSeconds) {
  if (ttlSeconds) {
    await kv.set(key, value, { ex: ttlSeconds });
  } else {
    await kv.set(key, value);
  }
}

async function kvDel(key) {
  await kv.del(key);
}

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
