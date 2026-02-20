const { sendJson, sendCors, now, generateKey, kvGet, kvSet } = require("./_lib");

const WINDOW = 48 * 60 * 60; // 48 hours in seconds

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return sendCors(res);
  if (req.method !== "POST") return sendJson(res, { error: "Method not allowed." }, 405);

  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    "unknown";

  const cooldownData = await kvGet(`claim:ip:${ip}`);
  if (cooldownData && now() - cooldownData.claimed_at < WINDOW) {
    const nextAvailable = cooldownData.claimed_at + WINDOW;
    return sendJson(res, {
      success: false,
      cooldown: true,
      next_available: nextAvailable,
      message: "You already claimed a key recently. Come back in 48 hours.",
    });
  }

  const key = generateKey();
  const expires_at = now() + WINDOW;
  const keyData = {
    key,
    type: "temp",
    created_at: now(),
    expires_at,
    roblox_user: null,
    used_by: null,
  };

  await kvSet(`key:${key}`, keyData, WINDOW + 3600);
  await kvSet(`claim:ip:${ip}`, { claimed_at: now(), key }, WINDOW);

  return sendJson(res, { success: true, key, expires_at, message: "Key claimed successfully." });
};
