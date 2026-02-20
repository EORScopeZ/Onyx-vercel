const { sendJson, sendCors, readBody, verifySecret, kvDel, kvSet } = require("./_lib");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return sendCors(res);
  if (req.method !== "POST") return sendJson(res, { error: "Method not allowed." }, 405);
  if (!verifySecret(req)) return sendJson(res, { error: "Forbidden." }, 403);

  const body = await readBody(req);
  const roblox_user = (body.roblox_user || "").trim().toLowerCase();
  if (!roblox_user) return sendJson(res, { error: "roblox_user required." }, 400);

  // Handle deletion
  if (body.delete === true) {
    await kvDel(`nametag:config:${roblox_user}`);
    return sendJson(res, { ok: true, deleted: true });
  }

  const cfg = body.config || {};

  // Handle image URL - accept both naming schemes (bot sends backgroundImage, Lua expects image_url)
  let imageUrl = cfg.backgroundImage || cfg.image_url || cfg.iconImage || null;
  if (imageUrl) {
    imageUrl = imageUrl.trim();
    if (/^\d+$/.test(imageUrl)) imageUrl = "rbxassetid://" + imageUrl;
    const isValid = imageUrl.match(/^(rbxassetid:\/\/\d+|rbxasset:\/\/[^/]+|https?:\/\/.+)$/);
    if (!isValid) return sendJson(res, { error: "Invalid image_url. Use rbxassetid://123456 or https://..." }, 400);
  }

  // Validate hex colors (accept both naming schemes)
  const hexRegex = /^#[0-9a-fA-F]{6}$/;
  const nameColor    = cfg.name_color    || cfg.textColor        || "#8b7fff";
  const tagColor     = cfg.tag_color     || cfg.backgroundColor  || "#1a1a2e";
  const glowColor    = cfg.glow_color    || cfg.outlineColor     || "#6d5ae0";
  const outlineColor = cfg.outline_color || cfg.outlineColor     || "#000000";

  for (const [field, val] of [["name_color", nameColor], ["tag_color", tagColor], ["glow_color", glowColor], ["outline_color", outlineColor]]) {
    if (val && !hexRegex.test(val)) return sendJson(res, { error: `Invalid ${field}. Use #rrggbb format.` }, 400);
  }

  // Store with Lua-compatible field names
  const config = {
    name_text:   (cfg.name_text || cfg.displayName || "Onyx User").slice(0, 32),
    tag_text:    (cfg.tag_text  || "ONYX").slice(0, 16),
    name_color:  nameColor,
    tag_color:   tagColor,
    glow_color:  glowColor,
    outline_color: outlineColor,
    image_url:   imageUrl,
    icon_image:  cfg.icon_image  || null,
    glitch_anim: cfg.glitch_anim === true,
    font:        cfg.font        || "GothamBlack",
    size_preset: cfg.size_preset || "medium",
    updatedAt:   Date.now(),
  };

  await kvSet(`nametag:config:${roblox_user}`, config);
  return sendJson(res, { ok: true, config });
};
