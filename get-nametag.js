const { sendJson, sendCors, kvGet } = require("./_lib");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return sendCors(res);
  if (req.method !== "GET") return sendJson(res, { error: "Method not allowed." }, 405);

  // Extract username from /get-nametag/USERNAME or query param
  const urlParts = req.url?.split("/get-nametag/")?.[1]?.split("?")?.[0] || "";
  const roblox_user = decodeURIComponent(urlParts).toLowerCase().trim();

  if (!roblox_user) return sendJson(res, { found: false });

  const activeData   = await kvGet(`active:user:${roblox_user}`);
  const customConfig = await kvGet(`nametag:config:${roblox_user}`);

  if (!activeData && !customConfig) return sendJson(res, { found: false });

  return sendJson(res, {
    found: true,
    active: !!activeData,
    config: customConfig || null,
  });
};
