const { sendJson, sendCors, readBody, kvGet, kvSet } = require("./_lib");

const HEARTBEAT_TTL = 15; // seconds - same as original CF worker

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return sendCors(res);
  if (req.method !== "POST") return sendJson(res, { error: "Method not allowed." }, 405);

  const body = await readBody(req);
  const roblox_user = (body.roblox_user || "").trim().toLowerCase();
  if (!roblox_user) return sendJson(res, { ok: false }, 400);

  const existing = await kvGet(`nametag:config:${roblox_user}`);
  const userData = existing || {
    roblox_user,
    name_text: "Onyx User",
    tag_text: "ONYX",
    name_color: "#8b7fff",
    tag_color: "#1a1a2e",
    glow_color: "#6d5ae0",
    outline_color: "#000000",
    image_url: null,
  };

  // Store with a short TTL - expires if heartbeat stops
  await kvSet(`active:user:${roblox_user}`, userData, HEARTBEAT_TTL);

  return sendJson(res, { ok: true });
};
