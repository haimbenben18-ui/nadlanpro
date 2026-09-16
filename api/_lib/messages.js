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

export { buildAgentShortMsg };
