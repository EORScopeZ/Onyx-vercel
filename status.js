const { sendJson, sendCors, verifySecret, now, kvGet } = require("./_lib");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return sendCors(res);
  if (req.method !== "GET") return sendJson(res, { error: "Method not allowed." }, 405);
  if (!verifySecret(req)) return sendJson(res, { error: "Forbidden." }, 403);

  // Key comes from either /status/KEY_HERE or ?key=KEY_HERE
  const urlKey = req.url?.split("/status/")?.[1]?.split("?")?.[0] || "";
  const key = decodeURIComponent(urlKey).trim();

  if (!key) return sendJson(res, { found: false });

  const row = await kvGet(`key:${key}`);
  if (!row) return sendJson(res, { found: false });

  return sendJson(res, {
    found: true,
    key: row.key,
    type: row.type,
    roblox_user: row.roblox_user,
    expires_at: row.expires_at,
    expired: row.type === "temp" && row.expires_at && now() > row.expires_at,
    used_by: row.used_by,
    last_check: row.last_check,
  });
};
