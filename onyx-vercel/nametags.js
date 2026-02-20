const { sendJson, sendCors, kvGet, kvList } = require("./_lib");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return sendCors(res);
  if (req.method !== "GET") return sendJson(res, { error: "Method not allowed." }, 405);

  const keys = await kvList("active:user:");
  const nametags = await Promise.all(keys.map((k) => kvGet(k)));

  return sendJson(res, { nametags: nametags.filter(Boolean) });
};
