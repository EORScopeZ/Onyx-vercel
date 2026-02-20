const { sendJson, sendCors, readBody, now, kvGet, kvSet } = require("./_lib");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return sendCors(res);
  if (req.method !== "POST") return sendJson(res, { error: "Method not allowed." }, 405);

  const body = await readBody(req);
  const key = (body.key || "").trim();
  const roblox_user = (body.roblox_user || "").trim().toLowerCase();
  const hwid = (body.hwid || "").trim();

  if (hwid) {
    const isBlacklisted = await kvGet(`bl:${hwid}`);
    if (isBlacklisted) return sendJson(res, { valid: false, whitelisted: false, message: "This device is blacklisted." });
  }

  if (!key || !roblox_user) {
    return sendJson(res, { valid: false, message: "Missing key or username." });
  }

  const row = await kvGet(`key:${key}`);
  if (!row) return sendJson(res, { valid: false, message: "Key not found." });

  if (row.type === "temp" && row.expires_at && now() > row.expires_at) {
    return sendJson(res, { valid: false, type: "expired", message: "Key expired." });
  }

  if (row.type === "whitelist" && row.roblox_user) {
    if (row.roblox_user.toLowerCase() !== roblox_user) {
      return sendJson(res, { valid: false, message: "Key is bound to a different username." });
    }
  }

  row.used_by = roblox_user;
  row.last_check = now();
  const ttl = row.expires_at ? Math.max(row.expires_at - now() + 3600, 60) : undefined;
  await kvSet(`key:${key}`, row, ttl);

  return sendJson(res, {
    valid: true,
    type: row.type,
    message: row.type === "whitelist" ? "Whitelisted." : "Temporary key valid.",
    expires_at: row.expires_at || null,
  });
};
