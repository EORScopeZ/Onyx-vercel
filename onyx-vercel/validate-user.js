const { sendJson, sendCors, readBody, now, kvGet, kvSet } = require("./_lib");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return sendCors(res);
  if (req.method !== "POST") return sendJson(res, { error: "Method not allowed." }, 405);

  const body = await readBody(req);
  const roblox_user = (body.roblox_user || "").trim().toLowerCase();
  const hwid = (body.hwid || "").trim();

  if (hwid) {
    const isBlacklisted = await kvGet(`bl:${hwid}`);
    if (isBlacklisted) return sendJson(res, { valid: false, whitelisted: false, message: "This device is blacklisted." });
  }

  if (!roblox_user) return sendJson(res, { valid: false, whitelisted: false, message: "Missing roblox_user." });

  // Check whitelist first
  const existingKey = await kvGet(`wl:${roblox_user}`);
  if (existingKey) {
    const row = await kvGet(`key:${existingKey}`);
    if (row) {
      row.used_by = roblox_user;
      row.last_check = now();
      await kvSet(`key:${existingKey}`, row);
    }
    return sendJson(res, { valid: true, whitelisted: true, type: "whitelist", message: "Whitelisted." });
  }

  // Fall back to key validation
  const key = (body.key || "").trim();
  if (key) {
    const row = await kvGet(`key:${key}`);
    if (!row) return sendJson(res, { valid: false, whitelisted: false, message: "Key not found." });

    if (row.type === "temp" && row.expires_at && now() > row.expires_at) {
      return sendJson(res, { valid: false, whitelisted: false, type: "expired", message: "Key expired." });
    }

    if (row.type === "whitelist" && row.roblox_user && row.roblox_user.toLowerCase() !== roblox_user) {
      return sendJson(res, { valid: false, whitelisted: false, message: "Key is bound to a different username." });
    }

    row.used_by = roblox_user;
    row.last_check = now();
    const ttl = row.expires_at ? Math.max(row.expires_at - now() + 3600, 60) : undefined;
    await kvSet(`key:${key}`, row, ttl);

    return sendJson(res, {
      valid: true,
      whitelisted: false,
      type: row.type,
      message: "Key valid.",
      expires_at: row.expires_at || null,
    });
  }

  return sendJson(res, { valid: false, whitelisted: false, need_key: true, message: "Not whitelisted. Please provide a key." });
};
