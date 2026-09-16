// ═══════════════════════════════════════════════════════════════════════
// Shared UltraMsg (WhatsApp) sender. Used by api/cron-agents.js and
// api/whatsapp.js so both the automatic and manual agent-broadcast paths
// send through the exact same function.
// ═══════════════════════════════════════════════════════════════════════

const ULTRAMSG_INSTANCE = process.env.ULTRAMSG_INSTANCE || "instance169955";
const ULTRAMSG_TOKEN    = process.env.ULTRAMSG_TOKEN    || "slhhpfslyuey11fp";

async function ultraSend(recipient, text) {
  // Groups (e.g. 12345@g.us) pass through unchanged. Phones get normalised.
  const isGroup = /@g\.us$/i.test(recipient || "");
  const to = isGroup ? recipient : (recipient || "").replace(/^0/, "972").replace(/[-\s+]/g, "");
  if (!to) return { sent: false, reason: "no_recipient" };
  try {
    const r = await fetch(`https://api.ultramsg.com/${ULTRAMSG_INSTANCE}/messages/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: ULTRAMSG_TOKEN, to, body: text }),
    });
    const d = await r.json();
    return d.sent ? { sent: true } : { sent: false, reason: d.error || "unknown" };
  } catch (e) {
    return { sent: false, reason: e.message };
  }
}

export { ultraSend };
