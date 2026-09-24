// ═══════════════════════════════════════════════════════════════════════
// Shared message formatting for the agent-broadcast automation, so the
// automatic (cron) and manual (Telegram "שלח למתווכים") sends always look
// identical.
// ═══════════════════════════════════════════════════════════════════════

function buildAgentShortMsg(prop) {
  const city   = prop.city || "באר שבע";
  const addr   = prop.address || prop.name || "";
  const rooms  = prop.rooms || "";
  const size   = prop.size ? `${prop.size} מ"ר` : "";
  const floor  = prop.floor || "";
  const priceN = Number(prop.price);
  const price  = (prop.price && !isNaN(priceN)) ? `${priceN.toLocaleString()} ₪` : "";
  let m = "דירה למכירה\n";
  m += `📍 ${addr}${city ? `, ${city}` : ""}\n`;
  const parts = [];
  if (rooms) parts.push(`🛏️ ${rooms} חד'`);
  if (floor) parts.push(`🏢 ק' ${floor}`);
  if (size)  parts.push(`📐 ${size}`);
  if (parts.length) m += `${parts.join(" | ")}\n`;
  if (price) m += `💰 ${price}\n`;
  m += "📞 חיים 0544740691";
  return m;
}

// Same key the web app uses (propKeyOf in index.html) to look up a
// per-property custom message Haim prepared in advance in the "מותאם אישית"
// editor (CRM / BrokerPage / AgentAutomation). Both the cron and the manual
// Telegram "שלח למתווכים" path must prefer this over the generic template —
// otherwise a prepared custom message silently gets ignored on send.
function propKeyOf(prop) {
  return `${prop && prop._src ? prop._src : "s"}_${prop && prop.id}`;
}

function resolveAgentMsg(prop, customTexts) {
  const saved = (customTexts || {})[propKeyOf(prop)];
  if (saved && typeof saved === "string" && saved.trim() !== "") return saved;
  return buildAgentShortMsg(prop);
}

export { buildAgentShortMsg, resolveAgentMsg, propKeyOf };
