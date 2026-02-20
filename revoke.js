const { sendJson, sendCors, readBody, verifySecret, kvGet, kvDel } = require("./_lib");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return sendCors(res);
  if (req.method !== "POST") return sendJson(res, { error: "Method not allowed." }, 405);
  if (!verifySecret(req)) return sendJson(res, { error: "Forbidden." }, 403);

  const body = await readBody(req);
  const roblox_user = (body.roblox_user || "").trim().toLowerCase();
  const keyParam = (body.key || "").trim();

  if (!roblox_user && !keyParam) return sendJson(res, { error: "Provide roblox_user or key." }, 400);

  let revoked = false;

  if (roblox_user) {
    const existingKey = await kvGet(`wl:${roblox_user}`);
    if (existingKey) {
      await kvDel(`key:${existingKey}`);
      await kvDel(`wl:${roblox_user}`);
      revoked = true;
    }
  } else if (keyParam) {
    const row = await kvGet(`key:${keyParam}`);
    if (row) {
      await kvDel(`key:${keyParam}`);
      if (row.roblox_user) await kvDel(`wl:${row.roblox_user}`);
      revoked = true;
    }
  }

  return sendJson(res, { revoked });
};
