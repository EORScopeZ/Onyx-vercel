const { sendJson, sendCors, readBody, verifySecret, now, generateKey, kvGet, kvSet } = require("./_lib");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return sendCors(res);
  if (req.method !== "POST") return sendJson(res, { error: "Method not allowed." }, 405);
  if (!verifySecret(req)) return sendJson(res, { error: "Forbidden." }, 403);

  const body = await readBody(req);
  const roblox_user = (body.roblox_user || "").trim().toLowerCase();
  if (!roblox_user) return sendJson(res, { error: "roblox_user required." }, 400);

  const existingKey = await kvGet(`wl:${roblox_user}`);
  if (existingKey) return sendJson(res, { key: existingKey, roblox_user, already_existed: true });

  const key = generateKey();
  const keyData = { key, type: "whitelist", roblox_user, created_at: now(), expires_at: null, used_by: null };
  await kvSet(`key:${key}`, keyData);
  await kvSet(`wl:${roblox_user}`, key);

  return sendJson(res, { key, roblox_user, already_existed: false });
};
