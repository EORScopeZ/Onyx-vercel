/**
 * Onyx Key System - Discord Bot with Permanent Info Embed + Rotating Key Drops
 *
 * Prefix commands:
 *   .whitelist  .revoke  .keystatus  .listwhitelist  .postkey  .testdrop
 *   .setupinfo - Post the permanent info embed (run once)
 */

const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    PermissionFlagsBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require("discord.js");
const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");
const http = require("http");

// ── Env vars ──────────────────────────────────────────────────────────────────
const BOT_TOKEN = process.env.BOT_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const SERVER_URL = (process.env.KEY_SERVER_URL || "").replace(/\/+$/, "");
const SERVER_SECRET = process.env.SERVER_SECRET;
const ADMIN_ROLE_ID = process.env.ADMIN_ROLE_ID;
const KEY_CHANNEL_ID = process.env.KEY_CHANNEL_ID;
const PURCHASE_LOG_CHANNEL_ID = process.env.PURCHASE_LOG_CHANNEL_ID;
const WHITELIST_LOG_CHANNEL_ID = process.env.WHITELIST_LOG_CHANNEL_ID;
const ROBLOX_GROUP_ID = process.env.ROBLOX_GROUP_ID;
const ROBLOX_COOKIE = process.env.ROBLOX_COOKIE;
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS) || 60000;
const LINKVERTISE_URL = process.env.LINKVERTISE_URL || "https://linkvertise.com/3652270/NkUQ7nvuATOm?o=sharing";
const PERMANENT_INFO_MESSAGE_ID = process.env.PERMANENT_INFO_MESSAGE_ID;
const ADMIN_LOG_CHANNEL_ID = process.env.ADMIN_LOG_CHANNEL_ID;
const LOG_RECEIVER_PORT = process.env.PORT || 3000;

// Nametag Sessions (Memory Storage)
const nametagSessions = new Map();

// ── Payment Details (Change these directly in code) ──────────────────────────
const PAYPAL_URL = "https://paypal.me/YOUR_LINK_HERE";
const SOLANA_WALLET = "YOUR_SOLANA_WALLET_ADDRESS";
const BTC_WALLET = "YOUR_BTC_WALLET_ADDRESS";

if (!BOT_TOKEN || !CLIENT_ID || !SERVER_URL || !SERVER_SECRET || !KEY_CHANNEL_ID) {
    console.error("[ERROR] Missing required env vars.");
    process.exit(1);
}

// ── Persistent storage ────────────────────────────────────────────────────────
const TIMER_FILE = path.join(__dirname, ".key_timer.json");
const PURCHASES_FILE = path.join(__dirname, ".processed_purchases.json");
const SHIRTS_FILE = path.join(__dirname, ".shirt_config.json");
const LAST_DROP_MESSAGE_FILE = path.join(__dirname, ".last_drop_message.json");
const INTERVAL_MS = 48 * 60 * 60 * 1000;

function loadLastDropMessage() {
    try {
        if (fs.existsSync(LAST_DROP_MESSAGE_FILE)) {
            return JSON.parse(fs.readFileSync(LAST_DROP_MESSAGE_FILE, "utf8"));
        }
    } catch { }
    return { messageId: null, channelId: null };
}

function saveLastDropMessage(data) {
    try { fs.writeFileSync(LAST_DROP_MESSAGE_FILE, JSON.stringify(data, null, 2)); } catch { }
}

function loadProcessedPurchases() {
    try {
        if (fs.existsSync(PURCHASES_FILE)) {
            return JSON.parse(fs.readFileSync(PURCHASES_FILE, "utf8"));
        }
    } catch { }
    return { processed: [] };
}

function saveProcessedPurchases(data) {
    try { fs.writeFileSync(PURCHASES_FILE, JSON.stringify(data, null, 2)); } catch { }
}

function loadShirtConfig() {
    try {
        if (fs.existsSync(SHIRTS_FILE)) {
            return JSON.parse(fs.readFileSync(SHIRTS_FILE, "utf8"));
        }
    } catch { }
    return { shirts: [] };
}

function saveShirtConfig(data) {
    try { fs.writeFileSync(SHIRTS_FILE, JSON.stringify(data, null, 2)); } catch { }
}

function getLastPostTime() {
    try {
        if (fs.existsSync(TIMER_FILE))
            return JSON.parse(fs.readFileSync(TIMER_FILE, "utf8")).lastPost || 0;
    } catch { }
    return 0;
}

function saveLastPostTime(ts) {
    try { fs.writeFileSync(TIMER_FILE, JSON.stringify({ lastPost: ts })); } catch { }
}

// ── API helpers ───────────────────────────────────────────────────────────────
const authHeaders = { "Content-Type": "application/json", "x-server-secret": SERVER_SECRET };

async function apiPost(endpoint, body) {
    const res = await fetch(`${SERVER_URL}${endpoint}`, { method: "POST", headers: authHeaders, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) throw new Error(`HTTP ${res.status} — ${data.error || "Unknown"}`);
    return data;
}

async function apiGet(endpoint) {
    const res = await fetch(`${SERVER_URL}${endpoint}`, { headers: authHeaders });
    const data = await res.json();
    if (!res.ok) throw new Error(`HTTP ${res.status} — ${data.error || "Unknown"}`);
    return data;
}

// ── Roblox API helpers ────────────────────────────────────────────────────────
async function getRobloxUserId(username) {
    const res = await fetch(`https://users.roblox.com/v1/usernames/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usernames: [username], excludeBannedUsers: true })
    });
    const data = await res.json();
    if (!data.data || data.data.length === 0) return null;
    return data.data[0].id;
}

async function getRobloxAvatarUrl(userId) {
    const res = await fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=420x420&format=Png&isCircular=false`);
    const data = await res.json();
    if (!data.data || data.data.length === 0) return null;
    return data.data[0].imageUrl;
}

async function getGroupSales(cursor = "") {
    if (!ROBLOX_COOKIE || !ROBLOX_GROUP_ID) return null;

    try {
        const url = `https://economy.roblox.com/v2/groups/${ROBLOX_GROUP_ID}/transactions?transactionType=Sale&limit=100${cursor ? `&cursor=${cursor}` : ""}`;
        const res = await fetch(url, {
            headers: {
                "Cookie": `.ROBLOSECURITY=${ROBLOX_COOKIE}`,
                "Content-Type": "application/json"
            }
        });

        if (!res.ok) {
            console.error(`[Roblox API] Error: ${res.status}`);
            return null;
        }

        const data = await res.json();
        return data;
    } catch (err) {
        console.error("[Roblox API] Failed to fetch sales:", err);
        return null;
    }
}

// ── Utility functions ─────────────────────────────────────────────────────────
function isAdmin(member) {
    if (!member) return false;
    if (!ADMIN_ROLE_ID) return member.permissions.has(PermissionFlagsBits.Administrator);
    return member.roles.cache.has(ADMIN_ROLE_ID) || member.permissions.has(PermissionFlagsBits.Administrator);
}

function formatExpiry(unix) {
    if (!unix) return "Never";
    return `<t:${unix}:R> (<t:${unix}:F>)`;
}

function formatRobux(amount) {
    return `💰 ${amount.toLocaleString()} R$`;
}

function generateKey() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let key = "ONYX-";
    for (let i = 0; i < 16; i++) {
        if (i > 0 && i % 4 === 0) key += "-";
        key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return key;
}

// ── Embed Builders ────────────────────────────────────────────────────────────
function buildMainEmbed(title, description, color = 0x8B7FFF) {
    return new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .setDescription(description)
        .setTimestamp()
        .setFooter({ text: "Onyx Key System", iconURL: "https://i.imgur.com/8B7FFF.png" });
}

function buildSuccessEmbed(title, description) {
    return buildMainEmbed(`✅ ${title}`, description, 0x44FF88);
}

function buildErrorEmbed(title, description) {
    return buildMainEmbed(`❌ ${title}`, description, 0xFF4444);
}

function buildWarningEmbed(title, description) {
    return buildMainEmbed(`⚠️ ${title}`, description, 0xFFAA00);
}

function buildInfoEmbed(title, description) {
    return buildMainEmbed(`ℹ️ ${title}`, description, 0x5865F2);
}

// PERMANENT INFO EMBED - Posted once at top
function buildPermanentInfoEmbed() {
    const shirtConfig = loadShirtConfig();
    const mainShirt = shirtConfig.shirts[0];
    const shirtLink = mainShirt ? `[${mainShirt.name}](https://www.roblox.com/catalog/${mainShirt.assetId})` : "Temporarily Unavailable";

    return new EmbedBuilder()
        .setColor(0x2B2D31) // Dark theme color
        .setTitle("🔑 Onyx Key System - Permanent Access")
        .setDescription(
            `## Premium Access\n` +
            `Skip the key system with premium access\n\n` +
            `### 💳 Payment Methods\n\n` +
            `**Robux Payment (Shirt)**\n` +
            `Purchase the shirt below to get auto-whitelisted:\n` +
            `🔗 **${shirtLink}**\n` +
            `> [!NOTE]\n` +
            `> Your inventory MUST be public after purchase.\n\n` +
            `**PayPal Payment**\n` +
            `**$10 USD** (Friends & Family only)\n` +
            `🔗 **[Click here to Pay](${PAYPAL_URL})**\n` +
            `*Create a ticket after buying with a screenshot*\n\n` +
            `### 🪙 Cryptocurrency ($10 USD)\n` +
            `**Bitcoin (BTC):**\n` +
            `\`${BTC_WALLET}\`\n` +
            `**Solana (SOL):**\n` +
            `\`${SOLANA_WALLET}\`\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `### 🎁 Free Access\n` +
            `Get your free key using the link below\n` +
            `**[CLICK HERE TO GET KEY](${LINKVERTISE_URL})**\n\n` +
            `✅ New keys posted every 48 hours`
        )
        .addFields(
            { name: "⏳ Key Duration", value: "48 Hours", inline: true },
            { name: "🔁 Auto-Renew", value: "Every 2 Days", inline: true }
        )
        .setImage("https://postimg.cc/1Vg95W32")
        .setTimestamp()
        .setFooter({ text: "Onyx Key System • Last Updated" });
}

function buildShirtInfoEmbed() {
    const shirtConfig = loadShirtConfig();
    const mainShirt = shirtConfig.shirts[0];

    const embed = new EmbedBuilder()
        .setColor(0xFF8800)
        .setTitle("👕 Robux Payment (Shirt)");

    if (mainShirt) {
        embed.setDescription(
            `Purchase the shirt below to get auto-whitelisted:\n\n` +
            `🔗 **[${mainShirt.name}](https://www.roblox.com/catalog/${mainShirt.assetId})**\n\n` +
            `> [!NOTE]\n` +
            `> Your inventory MUST be public for auto-whitelist to work.`
        );
    } else {
        embed.setDescription("Robux payment is temporarily unavailable. Please use other methods.");
    }

    return embed;
}

function buildPurchaseEmbed(purchaseData) {
    const { username, userId, avatarUrl, shirtName, shirtId, price, purchaseId } = purchaseData;

    return new EmbedBuilder()
        .setColor(0x00D4AA)
        .setTitle("💰 New Purchase Detected")
        .setDescription(`**${username}** purchased a whitelist shirt!`)
        .addFields(
            { name: "👤 Buyer", value: `**${username}**`, inline: true },
            { name: "🆔 User ID", value: `\`${userId}\``, inline: true },
            { name: "💵 Price", value: formatRobux(price), inline: true },
            { name: "👕 Item", value: `[${shirtName}](https://www.roblox.com/catalog/${shirtId})`, inline: false },
            { name: "🧾 Transaction ID", value: `\`${purchaseId}\``, inline: false }
        )
        .setThumbnail(avatarUrl || "https://i.imgur.com/8B7FFF.png")
        .setTimestamp()
        .setFooter({ text: "Onyx Purchase System" });
}

function buildWhitelistLogEmbed(whitelistData) {
    const { username, userId, avatarUrl, key, shirtName, price, purchaseId, autoWhitelisted, whitelistedBy } = whitelistData;

    const color = autoWhitelisted ? 0x44FF88 : (whitelistedBy ? 0x5865F2 : 0x44FF88);
    const title = autoWhitelisted ? "🤖 Auto-Whitelisted" : (whitelistedBy ? `👤 Whitelisted by ${whitelistedBy}` : "✅ Whitelisted");

    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .setDescription(`**${username}** has been granted permanent access.`)
        .addFields(
            { name: "👤 User", value: `**${username}**`, inline: true },
            { name: "🆔 User ID", value: `\`${userId}\``, inline: true },
            { name: "🔑 Key", value: `\`${key}\``, inline: true },
            { name: "⏳ Type", value: "Permanent ♾️", inline: true }
        )
        .setThumbnail(avatarUrl || "https://i.imgur.com/8B7FFF.png")
        .setTimestamp()
        .setFooter({ text: autoWhitelisted ? "Auto-Whitelist System" : (whitelistedBy ? `Manual • ${whitelistedBy}` : "Manual Whitelist") });

    if (shirtName && price) {
        embed.addFields(
            { name: "💵 Purchase Price", value: formatRobux(price), inline: true },
            { name: "👕 From Item", value: shirtName, inline: true }
        );
    }

    if (purchaseId) {
        embed.addFields(
            { name: "🧾 Transaction ID", value: `\`${purchaseId}\``, inline: false }
        );
    }

    return embed;
}

function buildBlacklistLogEmbed(hwid, actioner, isRemoval = false) {
    return new EmbedBuilder()
        .setColor(isRemoval ? 0x44FF88 : 0xFF4444)
        .setTitle(isRemoval ? "✅ HWID Unblacklisted" : "🚫 HWID Blacklisted")
        .setDescription(isRemoval
            ? `A hardware ID has been removed from the blacklist.`
            : `A hardware ID has been added to the blacklist.`)
        .addFields(
            { name: "🆔 HWID", value: `\`${hwid}\``, inline: true },
            { name: "👤 Action by", value: actioner, inline: true }
        )
        .setTimestamp()
        .setFooter({ text: "Onyx Blacklist System" });
}

function buildExecutionLogEmbed(data) {
    const { username, hwid, executor, thumbUrl, ip } = data;
    return new EmbedBuilder()
        .setColor(0x8B7FFF)
        .setTitle("🚀 Script Executed")
        .setDescription(`**${username}** has executed the script.`)
        .addFields(
            { name: "👤 Username", value: `**${username}**`, inline: true },
            { name: "⚙️ Executor", value: `\`${executor || "Unknown"}\``, inline: true },
            { name: "🆔 HWID", value: `\`${hwid}\``, inline: false },
            { name: "🌐 IP Address", value: `\`${ip || "Unknown"}\``, inline: true }
        )
        .setThumbnail(thumbUrl || "https://i.imgur.com/8B7FFF.png")
        .setTimestamp()
        .setFooter({ text: "Onyx Execution Logger" });
}

// ── Whitelist Logging Function ───────────────────────────────────────────────
async function logWhitelist(client, whitelistData) {
    if (!WHITELIST_LOG_CHANNEL_ID) return;

    try {
        const wlChannel = await client.channels.fetch(WHITELIST_LOG_CHANNEL_ID).catch(() => null);
        if (!wlChannel) {
            console.error("[Whitelist Log] Could not fetch whitelist log channel");
            return;
        }

        const embed = buildWhitelistLogEmbed(whitelistData);
        await wlChannel.send({ embeds: [embed] });
        console.log(`[Whitelist Log] Logged whitelist for ${whitelistData.username}`);
    } catch (err) {
        console.error("[Whitelist Log] Failed to log whitelist:", err);
    }
}

// ── Purchase Processing ───────────────────────────────────────────────────────
async function processPurchases(client) {
    if (!ROBLOX_COOKIE || !ROBLOX_GROUP_ID) {
        console.log("[Purchase System] Roblox cookie or group ID not set, skipping purchase check.");
        return;
    }

    if (!PURCHASE_LOG_CHANNEL_ID || !WHITELIST_LOG_CHANNEL_ID) {
        console.log("[Purchase System] Log channels not configured, skipping...");
        return;
    }

    const purchaseChannel = await client.channels.fetch(PURCHASE_LOG_CHANNEL_ID).catch(() => null);
    const whitelistChannel = await client.channels.fetch(WHITELIST_LOG_CHANNEL_ID).catch(() => null);

    if (!purchaseChannel || !whitelistChannel) {
        console.error("[Purchase System] Could not fetch log channels");
        return;
    }

    const shirtConfig = loadShirtConfig();
    if (shirtConfig.shirts.length === 0) {
        console.log("[Purchase System] No shirts configured, skipping...");
        return;
    }

    const processedData = loadProcessedPurchases();
    const sales = await getGroupSales();

    if (!sales || !sales.data) return;

    for (const transaction of sales.data) {
        if (processedData.processed.includes(transaction.id)) continue;

        const matchingShirt = shirtConfig.shirts.find(s => s.assetId === transaction.assetId.toString());
        if (!matchingShirt) continue;

        const buyerId = transaction.agent.id;
        const buyerName = transaction.agent.name;
        const price = transaction.currency.amount;
        const avatarUrl = await getRobloxAvatarUrl(buyerId);

        const purchaseData = {
            username: buyerName,
            userId: buyerId,
            avatarUrl,
            shirtName: matchingShirt.name,
            shirtId: matchingShirt.assetId,
            price: price,
            purchaseId: transaction.id
        };

        await purchaseChannel.send({ embeds: [buildPurchaseEmbed(purchaseData)] });

        try {
            const whitelistResult = await apiPost("/whitelist", { roblox_user: buyerName });

            const whitelistData = {
                ...purchaseData,
                key: whitelistResult.key,
                autoWhitelisted: true,
                whitelistedBy: null
            };

            await logWhitelist(client, whitelistData);

            processedData.processed.push(transaction.id);
            saveProcessedPurchases(processedData);

            console.log(`[Purchase System] Auto-whitelisted ${buyerName} for purchasing ${matchingShirt.name}`);
        } catch (err) {
            console.error(`[Purchase System] Failed to whitelist ${buyerName}:`, err);

            const errorEmbed = buildErrorEmbed("Auto-Whitelist Failed",
                `Failed to whitelist **${buyerName}** after purchase.\nError: ${err.message}`
            );
            await whitelistChannel.send({ embeds: [errorEmbed] });
        }
    }
}

// ── Client ────────────────────────────────────────────────────────────────────
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Delete old drop message and post new one
async function deleteOldDropMessage(channel) {
    const lastDrop = loadLastDropMessage();
    if (!lastDrop.messageId || !lastDrop.channelId) return;

    // Only delete if it's the same channel
    if (lastDrop.channelId !== channel.id) return;

    try {
        const oldMessage = await channel.messages.fetch(lastDrop.messageId).catch(() => null);
        if (oldMessage) {
            await oldMessage.delete();
            console.log(`[Drop System] Deleted old drop message: ${lastDrop.messageId}`);
        }
    } catch (err) {
        console.error(`[Drop System] Failed to delete old message:`, err);
    }
}

// Scheduled key drop - Deletes old message first, then posts new one
async function postScheduledKeyDrop(isTest = false) {
    console.log(`[DEBUG] Starting ${isTest ? 'TEST' : 'scheduled'} key drop...`);

    const channel = await client.channels.fetch(KEY_CHANNEL_ID).catch(err => {
        console.error(`[DEBUG] Failed to fetch channel ${KEY_CHANNEL_ID}:`, err);
        return null;
    });

    if (!channel) {
        console.error(`[Bot] Channel ${KEY_CHANNEL_ID} not found.`);
        return false;
    }

    console.log(`[DEBUG] Channel found: ${channel.name} (${channel.id})`);

    // Delete old drop message first
    await deleteOldDropMessage(channel);

    const expiresUnix = Math.floor((Date.now() + INTERVAL_MS) / 1000);
    const link = LINKVERTISE_URL;

    console.log(`[DEBUG] Link: ${link}`);
    console.log(`[DEBUG] Expires: ${expiresUnix}`);

    const embed = new EmbedBuilder()
        .setColor(0x8B7FFF)
        .setTitle("🔑  Onyx — Free Key Drop")
        .setDescription(
            `**A new 48-hour access window has opened!**\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `**Expires:** ${formatExpiry(expiresUnix)}\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `### [🔓 Get Your Key Here](${link})\n` +
            `Complete the checkpoint to receive your access key.`
        )
        .addFields(
            { name: "⏳ Duration", value: "48 Hours", inline: true },
            { name: "🔁 Next Drop", value: formatExpiry(expiresUnix), inline: true },
            { name: "👥 Access", value: "Available to everyone", inline: true }
        )
        .setThumbnail("https://i.imgur.com/8B7FFF.png")
        .setTimestamp()
        .setFooter({ text: "Onyx Key System" });

    console.log(`[DEBUG] Embed built: ${embed.data.title}`);

    try {
        const content = isTest
            ? `🧪 **TEST DROP** - This is a test of the drop system!\n||@here||`
            : `🔔 Scheduled 48-hour key drop!\n||@everyone||`;

        console.log(`[DEBUG] Sending message...`);
        const sentMessage = await channel.send({
            content: content,
            embeds: [embed]
        });

        console.log(`[DEBUG] Message sent: ${sentMessage.id}`);

        // Save this as the last drop message
        saveLastDropMessage({
            messageId: sentMessage.id,
            channelId: channel.id,
            timestamp: Date.now()
        });

        if (!isTest) {
            saveLastPostTime(Date.now());
        }

        return true;
    } catch (err) {
        console.error("[Bot] Failed to post scheduled key:", err);
        console.error(`[DEBUG] Error details:`, err.message);
        return false;
    }
}

// Manual key post - Also deletes old message
async function postManualKey() {
    console.log(`[DEBUG] Starting manual key post...`);

    const channel = await client.channels.fetch(KEY_CHANNEL_ID).catch(err => {
        console.error(`[DEBUG] Failed to fetch channel ${KEY_CHANNEL_ID}:`, err);
        return null;
    });

    if (!channel) {
        console.error(`[Bot] Channel ${KEY_CHANNEL_ID} not found.`);
        return false;
    }

    console.log(`[DEBUG] Channel found: ${channel.name} (${channel.id})`);

    // Delete old drop message first
    await deleteOldDropMessage(channel);

    const key = generateKey();
    const expiresUnix = Math.floor((Date.now() + INTERVAL_MS) / 1000);

    console.log(`[DEBUG] Generated key: ${key}`);

    try {
        await apiPost("/create-key", {
            key,
            expires_at: expiresUnix,
            type: "temporary",
            duration_hours: 48
        });
        console.log(`[DEBUG] Key stored in backend`);
    } catch (err) {
        console.error("[Bot] Failed to store key:", err);
    }

    const embed = new EmbedBuilder()
        .setColor(0xFF4444)
        .setTitle("🚨  Onyx — Temporary Key")
        .setDescription(
            `**🔑 Key system down, here is a temporary key!**\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `**Key:** \`${key}\`\n` +
            `**Expires:** ${formatExpiry(expiresUnix)}\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `This is a **temporary 48-hour key** generated manually by an admin.\n` +
            `Use this key immediately as it will not be available through the normal system.`
        )
        .addFields(
            { name: "⏳ Duration", value: "48 Hours", inline: true },
            { name: "🔁 Next Drop", value: "When system is restored", inline: true },
            { name: "⚠️ Type", value: "Temporary (Manual)", inline: true }
        )
        .setThumbnail("https://i.imgur.com/8B7FFF.png")
        .setTimestamp()
        .setFooter({ text: "Onyx Key System • Emergency Key" });

    console.log(`[DEBUG] Embed built: ${embed.data.title}`);

    try {
        const content = `🔑 Key system down, here is a temporary key!\n||@everyone||`;

        console.log(`[DEBUG] Sending message...`);
        const sentMessage = await channel.send({
            content: content,
            embeds: [embed]
        });

        console.log(`[DEBUG] Message sent: ${sentMessage.id}`);

        // Save this as the last drop message
        saveLastDropMessage({
            messageId: sentMessage.id,
            channelId: channel.id,
            timestamp: Date.now()
        });

        return true;
    } catch (err) {
        console.error("[Bot] Failed to post manual key:", err);
        console.error(`[DEBUG] Error details:`, err.message);
        return false;
    }
}

// Setup permanent info embed (run once)
async function setupPermanentInfo(message) {
    const channel = await client.channels.fetch(KEY_CHANNEL_ID).catch(() => null);
    if (!channel) {
        return message.reply({ embeds: [buildErrorEmbed("Error", `Could not fetch key channel: \`${KEY_CHANNEL_ID}\``)] });
    }

    // Check permissions explicitly
    const permissions = channel.permissionsFor(client.user);
    const missing = [];
    if (!permissions.has(PermissionFlagsBits.SendMessages)) missing.push("Send Messages");
    if (!permissions.has(PermissionFlagsBits.EmbedLinks)) missing.push("Embed Links");

    if (missing.length > 0) {
        return message.reply({
            embeds: [buildErrorEmbed("Bot Permission Error",
                `The bot is missing the following permissions in <#${channel.id}>:\n` +
                missing.map(p => `• **${p}**`).join("\n") +
                `\n\nPlease adjust the channel settings or the bot's role.`
            )]
        });
    }

    try {
        const embed = buildPermanentInfoEmbed();
        const sentMessage = await channel.send({ embeds: [embed] });

        // Pin the message
        let pinned = true;
        await sentMessage.pin().catch((err) => {
            pinned = false;
            console.log(`[Setup] Could not pin message: ${err.message}`);
        });

        const successEmbed = buildSuccessEmbed("Setup Complete",
            `Permanent info embeds posted successfully!\n` +
            (pinned ? `✅ Message pinned.\n` : `⚠️ **Warning:** Could not pin message (Bot needs **Manage Messages** permission).\n`) +
            `Message ID: \`${sentMessage.id}\`\n` +
            `Channel: <#${channel.id}>\n\n` +
            `**Link:** [Jump to Message](${sentMessage.url})\n\n` +
            `Add this to your Railway environment variables:\n` +
            `\`PERMANENT_INFO_MESSAGE_ID=${sentMessage.id}\``
        );

        await message.reply({ embeds: [successEmbed] });
    } catch (err) {
        console.error("[Setup] Unexpected error:", err);
        await message.reply({
            embeds: [buildErrorEmbed("Setup Failed", `An unexpected error occurred: \`${err.message}\`\n\nEnsure the bot has visibility of the channel and standard messaging permissions.`)]
        });
    }
}

function startScheduler() {
    const tick = async () => {
        if (Date.now() - getLastPostTime() >= INTERVAL_MS) {
            console.log(`[DEBUG] Scheduler triggering scheduled key drop`);
            await postScheduledKeyDrop(false);
        }
    };
    tick();
    setInterval(tick, 60_000);
}

function startPurchasePoller() {
    if (!ROBLOX_COOKIE || !ROBLOX_GROUP_ID) {
        console.log("[Purchase System] Purchase auto-detection disabled (no cookie/group configured).");
        console.log("[Purchase System] Set ROBLOX_COOKIE and ROBLOX_GROUP_ID to enable.");
        return;
    }

    if (!PURCHASE_LOG_CHANNEL_ID || !WHITELIST_LOG_CHANNEL_ID) {
        console.log("[Purchase System] Purchase auto-detection disabled (log channels not configured).");
        return;
    }

    console.log(`[Purchase System] Starting purchase poller (interval: ${POLL_INTERVAL_MS}ms)`);

    const poll = async () => {
        try {
            await processPurchases(client);
        } catch (err) {
            console.error("[Purchase System] Polling error:", err);
        }
    };

    poll();
    setInterval(poll, POLL_INTERVAL_MS);
}

// ── Log Receiver Server ──────────────────────────────────────────────────────
function startLogReceiver(client) {
    const server = http.createServer((req, res) => {
        if (req.method === "POST" && (req.url === "/validate-user" || req.url === "/validate")) {
            let body = "";
            req.on("data", chunk => { body += chunk.toString(); });
            req.on("end", async () => {
                try {
                    const data = JSON.parse(body);
                    const response = await apiPost(req.url, data);
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(JSON.stringify(response));
                } catch (err) {
                    console.error(`[Proxy] Error with ${req.url}:`, err.message);
                    res.writeHead(500, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ valid: false, message: "Key system is temporarily unavailable." }));
                }
            });
        } else if (req.method === "POST" && req.url === "/log-execution") {
            let body = "";
            req.on("data", chunk => { body += chunk.toString(); });
            req.on("end", async () => {
                try {
                    const data = JSON.parse(body);

                    // Capture IP address
                    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || "Unknown";
                    data.ip = ip;

                    // Fetch High Quality Avatar if userId is present
                    if (data.userId) {
                        try {
                            const freshThumb = await getRobloxAvatarUrl(data.userId);
                            if (freshThumb) data.thumbUrl = freshThumb;
                        } catch (avatarErr) {
                            console.warn("[Log Receiver] Failed to fetch avatar:", avatarErr.message);
                        }
                    }

                    if (ADMIN_LOG_CHANNEL_ID) {
                        const channel = await client.channels.fetch(ADMIN_LOG_CHANNEL_ID).catch(() => null);
                        if (channel) {
                            const embed = buildExecutionLogEmbed(data);
                            await channel.send({ embeds: [embed] });
                        }
                    }
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ success: true }));
                } catch (err) {
                    console.error("[Log Receiver] Error parsing log:", err);
                    res.writeHead(400, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ error: "Invalid JSON" }));
                }
            });
        } else {
            res.writeHead(404);
            res.end();
        }
    });

    server.listen(LOG_RECEIVER_PORT, () => {
        console.log(`[Log Receiver] Listening on port ${LOG_RECEIVER_PORT}`);
    });
}

client.once("ready", () => {
    console.log(`[Bot] Logged in as ${client.user.tag}`);
    client.user.setActivity("🔑 Onyx Key System", { type: "WATCHING" });
    startScheduler();
    startPurchasePoller();
    startLogReceiver(client);
});

// ── Whitelist Confirmation Panel ──────────────────────────────────────────────
async function showWhitelistPanel(message, robloxUsername) {
    const processingEmbed = buildInfoEmbed("Fetching Roblox Data...", `Looking up **${robloxUsername}**...`);
    const processingMsg = await message.reply({ embeds: [processingEmbed] });

    try {
        const userId = await getRobloxUserId(robloxUsername);
        if (!userId) {
            return processingMsg.edit({
                embeds: [buildErrorEmbed("User Not Found", `Could not find Roblox user: **${robloxUsername}**`)]
            });
        }

        const avatarUrl = await getRobloxAvatarUrl(userId);

        const confirmEmbed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle("🏷️ Whitelist Confirmation")
            .setDescription(`Are you sure you want to whitelist this user?`)
            .addFields(
                { name: "👤 Username", value: `**${robloxUsername}**`, inline: true },
                { name: "🆔 User ID", value: `\`${userId}\``, inline: true },
                { name: "⏳ Access Type", value: "Permanent ♾️", inline: true }
            )
            .setThumbnail(avatarUrl || "https://i.imgur.com/8B7FFF.png")
            .setTimestamp()
            .setFooter({ text: "Click a button below to confirm or deny" });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`whitelist_confirm_${message.id}`)
                .setLabel("Confirm")
                .setStyle(ButtonStyle.Primary)
                .setEmoji("✅"),
            new ButtonBuilder()
                .setCustomId(`whitelist_deny_${message.id}`)
                .setLabel("Deny")
                .setStyle(ButtonStyle.Secondary)
                .setEmoji("❌")
        );

        await processingMsg.edit({ embeds: [confirmEmbed], components: [row] });

        const collector = processingMsg.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 60000,
            filter: (i) => i.user.id === message.author.id
        });

        collector.on("collect", async (interaction) => {
            if (interaction.customId === `whitelist_confirm_${message.id}`) {
                await interaction.deferUpdate();

                try {
                    const data = await apiPost("/whitelist", { roblox_user: robloxUsername });

                    const successEmbed = new EmbedBuilder()
                        .setColor(data.already_existed ? 0xFFAA00 : 0x44FF88)
                        .setTitle(data.already_existed ? "⚠️ Already Whitelisted" : "✅ User Whitelisted")
                        .setDescription(data.already_existed
                            ? `**${robloxUsername}** already had permanent access.`
                            : `**${robloxUsername}** has been granted permanent access.`
                        )
                        .addFields(
                            { name: "🔑 Key", value: `\`${data.key}\``, inline: false },
                            { name: "👤 User", value: robloxUsername, inline: true },
                            { name: "⏳ Type", value: "Permanent ♾️", inline: true }
                        )
                        .setThumbnail(avatarUrl || "https://i.imgur.com/8B7FFF.png")
                        .setTimestamp()
                        .setFooter({ text: `Confirmed by ${interaction.user.username}` });

                    const whitelistData = {
                        username: robloxUsername,
                        userId: userId,
                        avatarUrl: avatarUrl,
                        key: data.key,
                        shirtName: null,
                        price: null,
                        purchaseId: null,
                        autoWhitelisted: false,
                        whitelistedBy: interaction.user.username
                    };
                    await logWhitelist(client, whitelistData);

                    await interaction.editReply({ embeds: [successEmbed], components: [] });
                } catch (err) {
                    await interaction.editReply({
                        embeds: [buildErrorEmbed("Whitelist Failed", err.message)],
                        components: []
                    });
                }
            } else {
                const deniedEmbed = buildWarningEmbed("Cancelled", `Whitelist for **${robloxUsername}** was cancelled.`);
                await interaction.update({ embeds: [deniedEmbed], components: [] });
            }
            collector.stop();
        });

        collector.on("end", (collected, reason) => {
            if (reason === "time" && collected.size === 0) {
                processingMsg.edit({
                    embeds: [buildErrorEmbed("Timed Out", "Whitelist confirmation timed out.")],
                    components: []
                }).catch(() => { });
            }
        });

    } catch (err) {
        processingMsg.edit({
            embeds: [buildErrorEmbed("Error", `Failed to fetch Roblox data: ${err.message}`)]
        });
    }
}

// ── Blacklist Confirmation Panel ──────────────────────────────────────────────
async function showBlacklistPanel(message, hwid) {
    const confirmEmbed = new EmbedBuilder()
        .setColor(0xFF4444)
        .setTitle("🚫 Blacklist Confirmation")
        .setDescription(`Are you sure you want to blacklist this hardware ID?`)
        .addFields(
            { name: "🆔 HWID", value: `\`${hwid}\``, inline: false },
            { name: "⚠️ Warning", value: "This will prevent the user from accessing the script.", inline: false }
        )
        .setTimestamp()
        .setFooter({ text: "Click a button below to confirm or deny" });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`blacklist_confirm_${message.id}`)
            .setLabel("Confirm Blacklist")
            .setStyle(ButtonStyle.Danger)
            .setEmoji("🚫"),
        new ButtonBuilder()
            .setCustomId(`blacklist_deny_${message.id}`)
            .setLabel("Cancel")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("❌")
    );

    const msg = await message.reply({ embeds: [confirmEmbed], components: [row] });

    const collector = msg.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 60000,
        filter: (i) => i.user.id === message.author.id
    });

    collector.on("collect", async (interaction) => {
        if (interaction.customId === `blacklist_confirm_${message.id}`) {
            await interaction.deferUpdate();

            try {
                const data = await apiPost("/blacklist", { hwid: hwid });

                const successEmbed = buildSuccessEmbed("HWID Blacklisted", `Successfully blacklisted HWID: \`${hwid}\``);
                successEmbed.setFooter({ text: `Confirmed by ${interaction.user.username}` });

                if (ADMIN_LOG_CHANNEL_ID) {
                    const adminChannel = await client.channels.fetch(ADMIN_LOG_CHANNEL_ID).catch(() => null);
                    if (adminChannel) {
                        await adminChannel.send({ embeds: [buildBlacklistLogEmbed(hwid, interaction.user.username, false)] });
                    }
                }

                await interaction.editReply({ embeds: [successEmbed], components: [] });
            } catch (err) {
                await interaction.editReply({
                    embeds: [buildErrorEmbed("Blacklist Failed", err.message)],
                    components: []
                });
            }
        } else {
            const deniedEmbed = buildWarningEmbed("Cancelled", `Blacklist for \`${hwid}\` was cancelled.`);
            await interaction.update({ embeds: [deniedEmbed], components: [] });
        }
        collector.stop();
    });

    collector.on("end", (collected, reason) => {
        if (reason === "time" && collected.size === 0) {
            msg.edit({
                embeds: [buildErrorEmbed("Timed Out", "Blacklist confirmation timed out.")],
                components: []
            }).catch(() => { });
        }
    });
}

// ── Prefix Command Handler ────────────────────────────────────────────────────

// ── Nametag Customization Handlers ──────────────────────────────────────────
function isValidHex(hex) {
    if (!hex) return false;
    return /^#?([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(hex);
}

function normalizeHex(hex) {
    if (!hex) return null;
    hex = hex.trim();
    if (!hex.startsWith("#")) hex = "#" + hex;
    return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(hex) ? hex : null;
}

client.on("interactionCreate", async interaction => {
    try {
        if (interaction.isButton()) {
            // ── Hub & Shared Buttons (No Session Required) ───────────────────
            if (interaction.customId.startsWith("ntg_hub_")) {
                const action = interaction.customId.replace("ntg_hub_", "");
                const modal = new ModalBuilder()
                    .setCustomId(`ntghubmodal_${action}`)
                    .setTitle(`${action.charAt(0).toUpperCase() + action.slice(1)} Nametag`);

                modal.addComponents(new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId("roblox_username").setLabel("Roblox Username").setStyle(TextInputStyle.Short).setRequired(true)
                ));
                return await interaction.showModal(modal);
            }

            if (interaction.customId === "ntg_back_to_hub") {
                await interaction.deferUpdate();
                return await sendNametagHub(interaction, true);
            }

            if (interaction.customId === "ntg_dismiss") {
                return await interaction.message.delete().catch(() => { });
            }

            // ── Personalized Buttons (Session Required) ───────────────────────
            if (interaction.customId.startsWith("ntg_")) {
                const parts = interaction.customId.split("_");
                const action = parts[1];
                const sessionId = parts.slice(2).join("_");
                const session = nametagSessions.get(sessionId);

                // Validation for actions needing a session
                const sessionActions = ["edittext", "images", "glitch", "save", "deleteconfirm", "back"];
                if (sessionActions.includes(action)) {
                    if (!session || interaction.user.id !== session.ownerId) {
                        return interaction.reply({ content: "❌ This customization session is no longer active or was started by someone else. Please open a new hub.", ephemeral: true });
                    }
                }

                if (action === "edittext") {
                    const modal = new ModalBuilder().setCustomId(`ntgmodal_${sessionId}`).setTitle("Edit Text & Colors");
                    modal.addComponents(
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("displayName").setLabel("Display Name").setStyle(TextInputStyle.Short).setValue(session.data.displayName || "").setRequired(false)),
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("textColor").setLabel("Text Color (Hex)").setStyle(TextInputStyle.Short).setValue(session.data.textColor || "").setRequired(false).setPlaceholder("#8b7fff")),
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("outlineColor").setLabel("Outline Color (Hex)").setStyle(TextInputStyle.Short).setValue(session.data.outlineColor || "").setRequired(false).setPlaceholder("#000000")),
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("backgroundColor").setLabel("Background Color (Hex)").setStyle(TextInputStyle.Short).setValue(session.data.backgroundColor || "").setRequired(false).setPlaceholder("#1a1a2e"))
                    );
                    return await interaction.showModal(modal);
                }

                if (action === "images") {
                    const modal = new ModalBuilder().setCustomId(`ntgimages_${sessionId}`).setTitle("Set Images");
                    modal.addComponents(
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("backgroundImage").setLabel("Background Image URL / ID").setStyle(TextInputStyle.Short).setValue(session.data.backgroundImage || "").setRequired(false)),
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("iconImage").setLabel("Icon Image URL / ID").setStyle(TextInputStyle.Short).setValue(session.data.iconImage || "").setRequired(false))
                    );
                    return await interaction.showModal(modal);
                }

                if (action === "glitch") {
                    await interaction.deferUpdate();
                    session.data.glitchAnim = !session.data.glitchAnim;
                    return await updateNametagPanel(interaction, session);
                }

                if (action === "save") {
                    await interaction.deferUpdate();
                    await apiPost("/set-nametag", {
                        roblox_user: session.username,
                        config: {
                            name_text: session.data.displayName,
                            name_color: session.data.textColor,
                            tag_color: session.data.backgroundColor || "#0f0f0f",
                            glow_color: session.data.outlineColor || "#8b7fff",
                            outline_color: session.data.outlineColor || "#8b7fff",
                            image_url: session.data.backgroundImage,
                            icon_image: session.data.iconImage,
                            glitch_anim: session.data.glitchAnim
                        }
                    });

                    const successEmbed = buildSuccessEmbed("✅ Saved Successfully", `Nametag for **${session.username}** has been saved.`);
                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId("ntg_back_to_hub").setLabel("Back to Hub").setStyle(ButtonStyle.Primary),
                        new ButtonBuilder().setCustomId("ntg_dismiss").setLabel("Dismiss").setStyle(ButtonStyle.Secondary)
                    );
                    return await interaction.editReply({ embeds: [successEmbed], components: [row] });
                }

                if (action === "back") {
                    await interaction.deferUpdate();
                    nametagSessions.delete(sessionId);
                    return await sendNametagHub(interaction, true);
                }

                if (action === "deleteconfirm") {
                    await interaction.deferUpdate();
                    await apiPost("/set-nametag", { roblox_user: session.username, delete: true });
                    const delEmbed = buildSuccessEmbed("🗑️ Deleted", `Nametag for **${session.username}** removed.`);
                    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("ntg_back_to_hub").setLabel("Back to Hub").setStyle(ButtonStyle.Primary));
                    return await interaction.editReply({ embeds: [delEmbed], components: [row] });
                }

                if (action === "cancel") {
                    nametagSessions.delete(sessionId);
                    return await interaction.message.delete().catch(() => { });
                }
            }
        }

        // ── Handle Modals ────────────────────────────────────────────────────
        if (interaction.isModalSubmit()) {
            if (interaction.customId.startsWith("ntghubmodal_")) {
                const action = interaction.customId.replace("ntghubmodal_", "");
                const robloxUser = interaction.fields.getTextInputValue("roblox_username").trim().toLowerCase();
                await interaction.deferUpdate();

                const data = await apiGet(`/get-nametag/${robloxUser}`);
                let cfg = {};
                if (data && data.config) {
                    const c = data.config;
                    cfg = {
                        displayName: c.name_text || null,
                        font: c.font || "GothamBlack",
                        textColor: c.name_color || null,
                        outlineColor: c.outline_color || c.glow_color || null,
                        backgroundColor: c.tag_color || null,
                        backgroundImage: c.image_url || null,
                        iconImage: c.icon_image || null,
                        glitchAnim: c.glitch_anim || false,
                        sizePreset: c.size_preset || "medium"
                    };
                }

                if (action === "view") {
                    const embed = new EmbedBuilder()
                        .setTitle(`Nametag: ${robloxUser}`)
                        .setColor("#8b7fff")
                        .addFields(
                            { name: "Display Name", value: cfg.displayName || "Onyx User", inline: true },
                            { name: "Text Color", value: cfg.textColor || "#8b7fff", inline: true },
                            { name: "Glitch", value: cfg.glitchAnim ? "✅" : "❌", inline: true }
                        );
                    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("ntg_back_to_hub").setLabel("Back to Hub").setStyle(ButtonStyle.Secondary));
                    return await interaction.editReply({ embeds: [embed], components: [row] });
                }

                if (action === "delete") {
                    const sessionId = Date.now().toString();
                    nametagSessions.set(sessionId, { id: sessionId, ownerId: interaction.user.id, username: robloxUser });
                    const embed = buildWarningEmbed("Confirm Delete", `Are you sure you want to delete **${robloxUser}'s** tag?`);
                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId(`ntg_deleteconfirm_${sessionId}`).setLabel("Delete Permanently").setStyle(ButtonStyle.Danger),
                        new ButtonBuilder().setCustomId("ntg_back_to_hub").setLabel("Cancel").setStyle(ButtonStyle.Secondary)
                    );
                    return await interaction.editReply({ embeds: [embed], components: [row] });
                }

                const sessionId = Date.now().toString();
                const session = { id: sessionId, ownerId: interaction.user.id, username: robloxUser, data: cfg };
                nametagSessions.set(sessionId, session);
                return await updateNametagPanel(interaction, session);
            }

            if (interaction.customId.startsWith("ntgmodal_")) {
                const sessionId = interaction.customId.replace("ntgmodal_", "");
                const session = nametagSessions.get(sessionId);
                if (!session) return interaction.reply({ content: "Expired", ephemeral: true });
                await interaction.deferUpdate();

                session.data.displayName = interaction.fields.getTextInputValue("displayName") || null;
                const tColor = normalizeHex(interaction.fields.getTextInputValue("textColor"));
                if (tColor) session.data.textColor = tColor;
                const oColor = normalizeHex(interaction.fields.getTextInputValue("outlineColor"));
                if (oColor) session.data.outlineColor = oColor;
                const bColor = normalizeHex(interaction.fields.getTextInputValue("backgroundColor"));
                if (bColor) session.data.backgroundColor = bColor;

                return await updateNametagPanel(interaction, session);
            }

            if (interaction.customId.startsWith("ntgimages_")) {
                const sessionId = interaction.customId.replace("ntgimages_", "");
                const session = nametagSessions.get(sessionId);
                if (!session) return interaction.reply({ content: "Expired", ephemeral: true });
                await interaction.deferUpdate();

                let bg = interaction.fields.getTextInputValue("backgroundImage")?.trim();
                let ic = interaction.fields.getTextInputValue("iconImage")?.trim();
                if (bg && /^\d+$/.test(bg)) bg = "rbxassetid://" + bg;
                if (ic && /^\d+$/.test(ic)) ic = "rbxassetid://" + ic;

                session.data.backgroundImage = bg || null;
                session.data.iconImage = ic || null;
                return await updateNametagPanel(interaction, session);
            }
        }

        // ── Handle Menus ─────────────────────────────────────────────────────
        if (interaction.isStringSelectMenu() && interaction.customId.startsWith("ntg_")) {
            // Menus currently unused but kept for future structure
            return;
        }
    } catch (err) {
        console.error("[Interaction Error]", err);
        try {
            if (interaction.deferred || interaction.replied) {
                await interaction.followUp({ content: `❌ Error: ${err.message}`, ephemeral: true });
            } else {
                await interaction.reply({ content: `❌ Error: ${err.message}`, ephemeral: true });
            }
        } catch { }
    }
});

async function sendNametagHub(interactionOrMessage, isEdit = false) {
    const embed = new EmbedBuilder()
        .setTitle("🏷️ Nametag Management Hub")
        .setDescription("Welcome to the Onyx Nametag System. Use the buttons below to manage player nametags.\n\n" +
            "✨ **Create Tag** - Setup a new player configuration\n" +
            "🔍 **View Tag** - Check existing settings\n" +
            "⚙️ **Edit Tag** - Modify colors, fonts, and images\n" +
            "🗑️ **Delete Tag** - Remove configuration permanently\n\n" +
            "*Changes replicate to Roblox instantly.*")
        .setColor("#8b7fff")
        .setThumbnail("https://i.imgur.com/8B7FFF.png")
        .setFooter({ text: "Onyx V2 Admin Support" });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("ntg_hub_create").setLabel("Create").setStyle(ButtonStyle.Success).setEmoji("✨"),
        new ButtonBuilder().setCustomId("ntg_hub_view").setLabel("View").setStyle(ButtonStyle.Primary).setEmoji("🔍"),
        new ButtonBuilder().setCustomId("ntg_hub_edit").setLabel("Edit").setStyle(ButtonStyle.Secondary).setEmoji("⚙️"),
        new ButtonBuilder().setCustomId("ntg_hub_delete").setLabel("Delete").setStyle(ButtonStyle.Danger).setEmoji("🗑️")
    );

    if (isEdit && typeof interactionOrMessage.editReply === "function") {
        return await interactionOrMessage.editReply({ embeds: [embed], components: [row] });
    } else {
        return await interactionOrMessage.reply({ embeds: [embed], components: [row] });
    }
}

async function updateNametagPanel(interactionOrMessage, session) {
    const embed = new EmbedBuilder()
        .setColor("#8b7fff")
        .setTitle(`📝 Customizing: ${session.username}`)
        .setDescription("Modify the fields below. Click **Save & Close** to apply changes to the Cloudflare database.")
        .addFields(
            { name: "👤 Display Name", value: session.data.displayName || "`Default` (Onyx User)", inline: true },
            { name: "🎨 Text Color", value: session.data.textColor || "`#F0F0F0`", inline: true },
            { name: "🖼️ BG Color", value: session.data.backgroundColor || "`#0f0f0f`", inline: true },
            { name: "✨ Glitch", value: session.data.glitchAnim ? "✅ Enabled" : "❌ Disabled", inline: true }
        )
        .setFooter({ text: "Roblox IDs and URLs are supported for images." });

    const resolveRobloxValue = (val) => {
        if (!val) return null;
        const id = val.match(/\d+/);
        return id ? `https://www.roblox.com/asset-thumbnail/image?assetId=${id[0]}&width=420&height=420&format=png` : val;
    };

    const isHttp = (url) => url && (url.startsWith("http://") || url.startsWith("https://"));

    // Preview image logic: Prefer resolveRobloxValue for reliable previews
    const bgPreview = resolveRobloxValue(session.data.backgroundImage);
    const iconPreview = resolveRobloxValue(session.data.iconImage);

    if (bgPreview) embed.setImage(bgPreview);
    if (iconPreview) embed.setThumbnail(iconPreview);

    // Image/URL labels for fields (if too long, truncate)
    if (session.data.backgroundImage) embed.addFields({ name: "🖼️ BG Image", value: `\`${session.data.backgroundImage.slice(0, 50)}\``, inline: false });
    if (session.data.iconImage) embed.addFields({ name: "🎐 Icon Image", value: `\`${session.data.iconImage.slice(0, 50)}\``, inline: false });

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`ntg_edittext_${session.id}`).setLabel("Text & Colors").setStyle(ButtonStyle.Primary).setEmoji("🎨"),
        new ButtonBuilder().setCustomId(`ntg_images_${session.id}`).setLabel("Images / Assets").setStyle(ButtonStyle.Primary).setEmoji("🖼️"),
        new ButtonBuilder().setCustomId(`ntg_glitch_${session.id}`).setLabel(`Glitch: ${session.data.glitchAnim ? 'ON' : 'OFF'}`).setStyle(session.data.glitchAnim ? ButtonStyle.Success : ButtonStyle.Secondary)
    );

    const row4 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`ntg_save_${session.id}`).setLabel("Save & Close").setStyle(ButtonStyle.Success).setEmoji("💾"),
        new ButtonBuilder().setCustomId(`ntg_back_${session.id}`).setLabel("Back to Hub").setStyle(ButtonStyle.Secondary).setEmoji("🔙"),
        new ButtonBuilder().setCustomId(`ntg_cancel_${session.id}`).setLabel("Cancel").setStyle(ButtonStyle.Danger).setEmoji("✖️")
    );

    // Smart reply/edit logic
    if (typeof interactionOrMessage.editReply === "function" && (interactionOrMessage.deferred || interactionOrMessage.replied)) {
        await interactionOrMessage.editReply({ embeds: [embed], components: [row1, row4] });
    } else if (typeof interactionOrMessage.reply === "function") {
        await interactionOrMessage.reply({ embeds: [embed], components: [row1, row4] });
    }
}

client.on("messageCreate", async message => {
    if (message.author.bot) return;
    if (!message.content.startsWith(".")) return;

    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    const member = message.member;
    const actioner = message.author.username ?? "Unknown";

    try {
        switch (command) {
            // .setupinfo - Post permanent info embed (run once)
            case "setupinfo":
                if (!isAdmin(member)) {
                    return message.reply({ embeds: [buildErrorEmbed("Permission Denied", "You don't have permission to use this command.")] });
                }
                await setupPermanentInfo(message);
                break;

            // .testdrop - Test the drop system (deletes old and posts new)
            case "testdrop":
                if (!isAdmin(member)) {
                    return message.reply({ embeds: [buildErrorEmbed("Permission Denied", "You don't have permission to use this command.")] });
                }

                const processingMsg = await message.reply({ embeds: [buildInfoEmbed("Testing...", "Testing drop system - will delete old message and post new one...")] });

                const success = await postScheduledKeyDrop(true); // true = test mode

                if (success) {
                    await processingMsg.edit({ embeds: [buildSuccessEmbed("Test Complete", "Test drop posted! Check the key channel. Old message should be deleted, new one posted.")] });
                } else {
                    await processingMsg.edit({ embeds: [buildErrorEmbed("Test Failed", "Failed to post test drop. Check logs.")] });
                }
                break;

            // .whitelist <roblox_username>
            case "whitelist":
                if (!isAdmin(member)) {
                    return message.reply({ embeds: [buildErrorEmbed("Permission Denied", "You don't have permission to use this command.")] });
                }
                const robloxUser = args[0];
                if (!robloxUser) {
                    return message.reply({ embeds: [buildErrorEmbed("Invalid Usage", "Usage: `.whitelist <roblox_username>`")] });
                }

                await showWhitelistPanel(message, robloxUser);
                break;

            // .blacklist <hwid>
            case "blacklist":
                if (!isAdmin(member)) {
                    return message.reply({ embeds: [buildErrorEmbed("Permission Denied", "You don't have permission to use this command.")] });
                }
                const hwid = args[0];
                if (!hwid) {
                    return message.reply({ embeds: [buildErrorEmbed("Invalid Usage", "Usage: `.blacklist <hwid>`")] });
                }

                await showBlacklistPanel(message, hwid);
                break;

            // .unblacklist <hwid> / .removeblacklist <hwid>
            case "unblacklist":
            case "removeblacklist":
                if (!isAdmin(member)) {
                    return message.reply({ embeds: [buildErrorEmbed("Permission Denied", "You don't have permission to use this command.")] });
                }
                const hwid_unblacklist = args[0];
                if (!hwid_unblacklist) {
                    return message.reply({ embeds: [buildErrorEmbed("Invalid Usage", `Usage: \`.${command} <hwid>\``)] });
                }

                const processingEmbed_unblacklist = buildInfoEmbed("Processing...", `Removing HWID from blacklist...`);
                const msg_unblacklist = await message.reply({ embeds: [processingEmbed_unblacklist] });

                try {
                    const data = await apiPost("/unblacklist", { hwid: hwid_unblacklist });

                    const embed = buildSuccessEmbed("HWID Unblacklisted", `Successfully removed HWID from blacklist: \`${hwid_unblacklist}\``);
                    embed.setFooter({ text: `Action by ${actioner}` });

                    if (ADMIN_LOG_CHANNEL_ID) {
                        const adminChannel = await client.channels.fetch(ADMIN_LOG_CHANNEL_ID).catch(() => null);
                        if (adminChannel) {
                            await adminChannel.send({ embeds: [buildBlacklistLogEmbed(hwid_unblacklist, actioner, true)] });
                        }
                    }

                    await msg_unblacklist.edit({ embeds: [embed] });
                } catch (err) {
                    await msg_unblacklist.edit({ embeds: [buildErrorEmbed("Removal Failed", err.message)] });
                }
                break;

            // .revoke <roblox_username|key>
            case "revoke":
                if (!isAdmin(member)) {
                    return message.reply({ embeds: [buildErrorEmbed("Permission Denied", "You don't have permission to use this command.")] });
                }
                const target = args[0];
                if (!target) {
                    return message.reply({ embeds: [buildErrorEmbed("Invalid Usage", "Usage: `.revoke <roblox_username|key>`")] });
                }

                const isKey = target.includes("-") || target.length > 20;
                const processingEmbed_revoke = buildInfoEmbed("Processing...", isKey ? `Revoking key...` : `Revoking **${target}**...`);
                const msg_revoke = await message.reply({ embeds: [processingEmbed_revoke] });

                try {
                    const data = await apiPost("/revoke", {
                        roblox_user: isKey ? undefined : target,
                        key: isKey ? target : undefined
                    });

                    const embed = data.revoked
                        ? buildSuccessEmbed("Access Revoked", `Successfully revoked **${target}**.`)
                        : buildWarningEmbed("Not Found", `No entry found for **${target}**.`);

                    embed.setFooter({ text: `Action by ${actioner}` });
                    await msg_revoke.edit({ embeds: [embed] });
                } catch (err) {
                    await msg_revoke.edit({ embeds: [buildErrorEmbed("Revoke Failed", err.message)] });
                }
                break;

            // .keystatus <key>
            case "keystatus":
                if (!isAdmin(member)) {
                    return message.reply({ embeds: [buildErrorEmbed("Permission Denied", "You don't have permission to use this command.")] });
                }
                const key = args[0];
                if (!key) {
                    return message.reply({ embeds: [buildErrorEmbed("Invalid Usage", "Usage: `.keystatus <key>`")] });
                }

                const processingEmbed_keystatus = buildInfoEmbed("Checking...", "Fetching key status...");
                const msg_keystatus = await message.reply({ embeds: [processingEmbed_keystatus] });

                try {
                    const data = await apiGet(`/status/${encodeURIComponent(key)}`);
                    if (!data.found) {
                        return msg_keystatus.edit({ embeds: [buildErrorEmbed("Not Found", "Key not found in database.")] });
                    }

                    const embed = new EmbedBuilder()
                        .setColor(data.expired ? 0xFF4444 : (data.type === "whitelist" ? 0x44FF88 : 0x8B7FFF))
                        .setTitle("🔑 Key Status")
                        .setDescription(`**${data.key}**`)
                        .addFields(
                            { name: "📋 Type", value: data.type || "Standard", inline: true },
                            { name: "✅ Status", value: data.expired ? "❌ Expired" : "✅ Active", inline: true },
                            { name: "👤 Assigned To", value: data.roblox_user || "Unassigned", inline: true },
                            { name: "⏳ Expires", value: formatExpiry(data.expires_at), inline: true },
                            { name: "🔄 Last Used", value: data.used_by ? `<t:${data.used_by}:R>` : "Never", inline: true },
                            { name: "🔍 Last Check", value: data.last_check ? formatExpiry(data.last_check) : "Never", inline: true }
                        )
                        .setTimestamp()
                        .setFooter({ text: `Checked by ${actioner}` });

                    await msg_keystatus.edit({ embeds: [embed] });
                } catch (err) {
                    await msg_keystatus.edit({ embeds: [buildErrorEmbed("Check Failed", err.message)] });
                }
                break;

            // .listwhitelist
            case "listwhitelist":
                if (!isAdmin(member)) {
                    return message.reply({ embeds: [buildErrorEmbed("Permission Denied", "You don't have permission to use this command.")] });
                }

                const processingEmbed_listwhitelist = buildInfoEmbed("Loading...", "Fetching whitelist database...");
                const msg_listwhitelist = await message.reply({ embeds: [processingEmbed_listwhitelist] });

                try {
                    const data = await apiGet("/list-whitelist");
                    if (data.count === 0) {
                        return msg_listwhitelist.edit({ embeds: [buildWarningEmbed("Empty", "No whitelisted users found.")] });
                    }

                    const lines = data.users.map((u, i) =>
                        `**${i + 1}.** \`${u.roblox_user}\` • \`${u.key}\``
                    ).join("\n");

                    const embed = new EmbedBuilder()
                        .setColor(0x8B7FFF)
                        .setTitle(`📋 Whitelisted Users (${data.count})`)
                        .setDescription(lines.length > 4000 ? lines.slice(0, 4000) + "\n..." : lines)
                        .setTimestamp()
                        .setFooter({ text: `Requested by ${actioner}` });

                    await msg_listwhitelist.edit({ embeds: [embed] });
                } catch (err) {
                    await msg_listwhitelist.edit({ embeds: [buildErrorEmbed("List Failed", err.message)] });
                }
                break;

            // .postkey
            case "postkey":
                if (!isAdmin(member)) {
                    return message.reply({ embeds: [buildErrorEmbed("Permission Denied", "You don't have permission to use this command.")] });
                }

                const processingMsg_postkey = await message.reply({ embeds: [buildInfoEmbed("Generating...", "Creating new temporary key...")] });

                console.log(`[DEBUG] .postkey command triggered by ${message.author.username}`);
                const success_postkey = await postManualKey();

                if (success_postkey) {
                    await processingMsg_postkey.edit({ embeds: [buildSuccessEmbed("Posted", "Temporary key posted successfully! Old message deleted.")] });
                } else {
                    await processingMsg_postkey.edit({ embeds: [buildErrorEmbed("Post Failed", "Failed to post temporary key. Check channel permissions and bot logs.")] });
                }
                break;

            // .nametagpanel <roblox_username>
            case "nametagpanel":
                if (!isAdmin(member)) {
                    return message.reply({ embeds: [buildErrorEmbed("Permission Denied", "You don't have permission to use this command.")] });
                }
                const targetUser = args[0];
                if (!targetUser) {
                    return sendNametagHub(message);
                }

                const sessionId = Date.now().toString();
                try {
                    await message.channel.sendTyping();
                    const data = await apiGet(`/get-nametag/${encodeURIComponent(targetUser)}`);
                    let existingConfig = {};
                    if (data && data.config) {
                        existingConfig = {
                            displayName: data.config.name_text || null,
                            font: data.config.font || "GothamBlack",
                            textColor: data.config.name_color || null,
                            outlineColor: data.config.outline_color || data.config.glow_color || null,
                            backgroundColor: data.config.tag_color || null,
                            backgroundImage: data.config.image_url || null,
                            iconImage: data.config.icon_image || null,
                            glitchAnim: data.config.glitch_anim || false,
                            sizePreset: data.config.size_preset || "medium"
                        };
                    }

                    const session = {
                        id: sessionId,
                        ownerId: message.author.id,
                        username: targetUser,
                        data: existingConfig,
                        lastInteraction: Date.now()
                    };
                    nametagSessions.set(sessionId, session);
                    await updateNametagPanel(message, session);
                } catch (err) {
                    console.error(err);
                    message.reply({ embeds: [buildErrorEmbed("API Error", `Failed to connection to backend: ${err.message}`)] });
                }
                break;

            // .checkpurchases
            case "checkpurchases":
                if (!isAdmin(member)) {
                    return message.reply({ embeds: [buildErrorEmbed("Permission Denied", "You don't have permission to use this command.")] });
                }

                if (!ROBLOX_COOKIE || !ROBLOX_GROUP_ID) {
                    return message.reply({ embeds: [buildErrorEmbed("Not Configured", "Purchase checking requires ROBLOX_COOKIE and ROBLOX_GROUP_ID to be set.")] });
                }

                const processingMsg_checkpurchases = await message.reply({ embeds: [buildInfoEmbed("Checking...", "Manually checking for new purchases...")] });

                try {
                    await processPurchases(client);
                    await processingMsg_checkpurchases.edit({ embeds: [buildSuccessEmbed("Complete", "Purchase check completed! Check the purchase log channel for results.")] });
                } catch (err) {
                    await processingMsg_checkpurchases.edit({ embeds: [buildErrorEmbed("Check Failed", err.message)] });
                }
                break;

            // .setshirt <asset_id> <price> <name...>
            case "setshirt":
                if (!isAdmin(member)) {
                    return message.reply({ embeds: [buildErrorEmbed("Permission Denied", "You don't have permission to use this command.")] });
                }

                if (!ROBLOX_GROUP_ID) {
                    return message.reply({ embeds: [buildErrorEmbed("Not Configured", "This command requires ROBLOX_GROUP_ID to be set.")] });
                }

                const assetId = args[0];
                const price = parseInt(args[1]);
                const name = args.slice(2).join(" ");

                if (!assetId || isNaN(price) || !name) {
                    return message.reply({ embeds: [buildErrorEmbed("Invalid Usage", "Usage: `.setshirt <asset_id> <price_in_robux> <name>`\nExample: `.setshirt 123456789 50 Premium Shirt`")] });
                }

                const shirtConfig = loadShirtConfig();

                const existing = shirtConfig.shirts.find(s => s.assetId === assetId);
                if (existing) {
                    existing.price = price;
                    existing.name = name;
                } else {
                    shirtConfig.shirts.push({ assetId, price, name });
                }

                saveShirtConfig(shirtConfig);

                const embed_setshirt = buildSuccessEmbed("Shirt Configured",
                    `**${name}** has been ${existing ? 'updated' : 'added'} to the whitelist system.\n` +
                    `Asset ID: \`${assetId}\`\n` +
                    `Price: ${formatRobux(price)}`
                );
                await message.reply({ embeds: [embed_setshirt] });
                break;

            // .removeshirt <asset_id>
            case "removeshirt":
                if (!isAdmin(member)) {
                    return message.reply({ embeds: [buildErrorEmbed("Permission Denied", "You don't have permission to use this command.")] });
                }

                const assetId_removeshirt = args[0];
                if (!assetId_removeshirt) {
                    return message.reply({ embeds: [buildErrorEmbed("Invalid Usage", "Usage: `.removeshirt <asset_id>`")] });
                }

                const shirtConfig_removeshirt = loadShirtConfig();
                const initialLength = shirtConfig_removeshirt.shirts.length;
                shirtConfig_removeshirt.shirts = shirtConfig_removeshirt.shirts.filter(s => s.assetId !== assetId_removeshirt);

                if (shirtConfig_removeshirt.shirts.length === initialLength) {
                    return message.reply({ embeds: [buildErrorEmbed("Not Found", `No shirt found with Asset ID: \`${assetId_removeshirt}\``)] });
                }

                saveShirtConfig(shirtConfig_removeshirt);
                await message.reply({ embeds: [buildSuccessEmbed("Removed", `Shirt with Asset ID \`${assetId_removeshirt}\` has been removed.`)] });
                break;

            // .listshirts
            case "listshirts":
                const shirtConfig_listshirts = loadShirtConfig();

                if (shirtConfig_listshirts.shirts.length === 0) {
                    return message.reply({ embeds: [buildWarningEmbed("No Shirts", "No shirts configured for auto-whitelist.")] });
                }

                const lines = shirtConfig_listshirts.shirts.map((s, i) =>
                    `**${i + 1}.** [${s.name}](https://www.roblox.com/catalog/${s.assetId}) - ${formatRobux(s.price)} (\`${s.assetId}\`)`
                ).join("\n");

                const embed_listshirts = new EmbedBuilder()
                    .setColor(0x8B7FFF)
                    .setTitle("👕 Whitelist Shirts")
                    .setDescription(lines)
                    .setTimestamp()
                    .setFooter({ text: "These shirts trigger auto-whitelist when purchased" });

                await message.reply({ embeds: [embed_listshirts] });
                break;

            default:
                // Unknown command help
                const helpEmbed = buildInfoEmbed(
                    "Onyx Key System Commands",
                    "**Setup:**\n" +
                    "`.setupinfo` - Post the permanent info embed (run once)\n\n" +
                    "**Admin Commands:**\n" +
                    "`.whitelist <username>` - Whitelist a Roblox user\n" +
                    "`.blacklist <hwid>` - Blacklist a hardware ID (Confirmation required)\n" +
                    "`.unblacklist <hwid>` - Remove a hardware ID from blacklist\n" +
                    "`.revoke <username|key>` - Revoke access\n" +
                    "`.keystatus <key>` - Check key status\n" +
                    "`.listwhitelist` - List all whitelisted users\n" +
                    "`.postkey` - Generate and post temporary key\n" +
                    "`.testdrop` - Test the drop system (delete old, post new)\n" +
                    (ROBLOX_GROUP_ID ? "`.checkpurchases` - Check for new purchases\n" : "") +
                    (ROBLOX_GROUP_ID ? "`.setshirt <id> <price> <name>` - Add/update shirt\n" : "") +
                    (ROBLOX_GROUP_ID ? "`.removeshirt <id>` - Remove shirt\n" : "") +
                    "`.listshirts` - List configured shirts\n\n" +
                    "**Nametag System:**\n" +
                    "`.nametagpanel <roblox_username>` - Open nametag management hub\n\n" +
                    "**Logging:**\n" +
                    "Execution logs and blacklist actions are sent to the configured admin channel."
                );
                await message.reply({ embeds: [helpEmbed] });
                break;
        }

    } catch (err) {
        console.error(`[Bot] Error in command ${command}:`, err);
        try {
            await message.reply({
                embeds: [buildErrorEmbed("Unexpected Error", `\`${err.message}\``)]
            });
        } catch { }
    }
});

client.login(BOT_TOKEN);