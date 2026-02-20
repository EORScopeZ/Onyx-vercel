const { sendJson, sendCors, verifySecret, kvGet, kvList } = require("./_lib");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return sendCors(res);
  if (req.method !== "GET") return sendJson(res, { error: "Method not allowed." }, 405);
  if (!verifySecret(req)) return sendJson(res, { error: "Forbidden." }, 403);

  const keys = await kvList("wl:");
  const users = await Promise.all(
    keys.map(async (fullKey) => {
      const username = fullKey.replace("wl:", "");
      const key = await kvGet(fullKey);
      return { roblox_user: username, key };
    })
  );

  return sendJson(res, { count: users.length, users });
};
