const { sendJson, sendCors, readBody, verifySecret, now, kvGet, kvSet, kvDel } = require("./_lib");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return sendCors(res);
  if (!verifySecret(req)) return sendJson(res, { error: "Forbidden." }, 403);

  const body = await readBody(req);
  const hwid = (body.hwid || "").trim();
  if (!hwid) return sendJson(res, { error: "hwid required." }, 400);

  const isUnblacklist = req.url?.includes("unblacklist");

  if (isUnblacklist) {
    await kvDel(`bl:${hwid}`);
    return sendJson(res, { success: true, hwid });
  } else {
    await kvSet(`bl:${hwid}`, { blacklisted: true, at: now() });
    return sendJson(res, { success: true, hwid });
  }
};
