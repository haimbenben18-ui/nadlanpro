// ═══════════════════════════════════════════════════════════════════════
// Vercel Cron job — runs every 15 min (see vercel.json) and decides, on
// every tick, whether one of the configured send-times has just arrived.
// Running frequently (instead of scheduling exact Israel times in UTC)
// means the schedule survives daylight-saving changes automatically and
// changes to "שעות שליחה" in the app take effect immediately — no redeploy.
//
// When a slot is due, it sends automatically (no approval step): it takes
// the next properties in rotation from the automation queue and messages
// every selected agent + enabled WhatsApp group. After sending it posts an
// info-only summary to Motti on Telegram — nothing is asked, it's a report.
//
// Safety gates (all enforced here, every tick):
//   • 08:00–20:00 Israel time only.
//   • Not Friday from 12:00, not Saturday.
//   • Not on a Jewish holiday (computed live — see _lib/schedule.js).
//   • Only if "שליחה אוטומטית" is enabled (agentAuto.autoSendEnabled, on by default).
//   • Never re-sends the same slot twice, and skips a slot marked "דלג" from Telegram.
// ═══════════════════════════════════════════════════════════════════════

import { fsGetDoc, fsSetDoc } from "./_lib/firestore.js";
import { israelNow, todayKey, canSendNow, pickDueSlot } from "./_lib/schedule.js";
import { ultraSend } from "./_lib/ultramsg.js";
import { resolveAgentMsg } from "./_lib/messages.js";

const TELEGRAM_CHAT_ID   = "5941736529";
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

async function sendTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN) {
    console.error("TELEGRAM_BOT_TOKEN missing");
    return false;
  }
  const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: "Markdown" }),
  });
  return r.ok;
}

function fmtPropLine(p) {
  const street = p.address || p.name || "—";
  const city   = p.city || "באר שבע";
  const rooms  = p.rooms ? `${p.rooms} חד'` : "—";
  const priceN = Number(p.price);
  const price  = (p.price && !isNaN(priceN)) ? `${priceN.toLocaleString()} ₪` : "—";
  return `${street}, ${city} — ${rooms} — ${price}`;
}

export default async function handler(req, res) {
  try {
    const now = israelNow();

    // ── שער שעות/שבת/חגים ──
    const gate = await canSendNow(now);
    if (!gate.ok) {
      return res.status(200).json({ status: "blocked", reason: gate.reason });
    }

    // ── טעינת קונפיג + נתונים ──
    const auto       = (await fsGetDoc("data/agentAuto"))      || {};
    const sellersDoc = (await fsGetDoc("data/sellers"))        || {};
    const brokerDoc  = (await fsGetDoc("data/brokerProps"))    || {};
    const agentsDoc  = (await fsGetDoc("data/agentsContacts")) || {};
    const groupsDoc  = (await fsGetDoc("data/agentGroups"))    || {};
    const customTextsDoc = (await fsGetDoc("data/customAgentTexts")) || {};

    const config = (auto.items && typeof auto.items === "object" && !Array.isArray(auto.items)) ? auto.items : {};

    if (config.autoSendEnabled === false) {
      return res.status(200).json({ status: "auto_disabled" });
    }

    const sellers = Array.isArray(sellersDoc.items) ? sellersDoc.items : [];
    const broker  = Array.isArray(brokerDoc.items)  ? brokerDoc.items  : [];
    const agents  = Array.isArray(agentsDoc.items)  ? agentsDoc.items  : [];
    const groups  = Array.isArray(groupsDoc.items)  ? groupsDoc.items  : [];
    const customTexts = (customTextsDoc.items && typeof customTextsDoc.items === "object" && !Array.isArray(customTextsDoc.items)) ? customTextsDoc.items : {};

    const queueRefs = Array.isArray(config.items) ? config.items : [];
    const sendTimes = Array.isArray(config.sendTimes) && config.sendTimes.length ? config.sendTimes : ["08:30", "11:30", "14:30", "17:30"];
    const lastSent  = config.lastSent || {};
    const skipped   = config.skippedToday || {};
    const selectedAgents = Array.isArray(config.selectedAgents) ? config.selectedAgents : [];

    // ── האם יש חלון שליחה שהגיע עכשיו? ──
    const slot = pickDueSlot(sendTimes, now);
    if (!slot) {
      return res.status(200).json({ status: "no_active_slot" });
    }
    const dayKey  = todayKey(now);
    const slotKey = `${dayKey}_${slot}`;
    if (lastSent[slotKey] || skipped[slotKey]) {
      return res.status(200).json({ status: "already_handled", slot: slotKey });
    }

    // ── פתירת תור הדירות ──
    const all = [
      ...sellers.map(s => ({ ...s, _src: "s" })),
      ...broker .map(p => ({ ...p, _src: "b" })),
    ];
    const queueProps = queueRefs
      .map(it => all.find(p => p.id === it.propId && p._src === it.propSrc))
      .filter(Boolean);

    if (queueProps.length === 0) {
      return res.status(200).json({ status: "queue_empty" });
    }

    // ── נמענים ──
    const targetAgents = agents.filter(a => selectedAgents.includes(a.id) && a.phone);
    const targetGroups = groups.filter(g => g.enabled && g.id);
    const recipients = [
      ...targetAgents.map(a => ({ to: a.phone, label: a.name || a.phone, kind: "agent" })),
      ...targetGroups.map(g => ({ to: g.id,    label: g.name,             kind: "group" })),
    ];
    if (recipients.length === 0) {
      // לא מסמנים כמטופל — אם יוגדרו נמענים בקרוב, הטיק הבא (עד 20 דק') עדיין בחלון.
      return res.status(200).json({ status: "no_recipients", slot: slotKey });
    }

    // ── בחירת דירות לסבב הזה — רוטציה, לא הפגזה של כל התור בכל פעם ──
    const propsPerSlot = Number.isInteger(config.propsPerSlot) && config.propsPerSlot > 0 ? config.propsPerSlot : 2;
    const n = Math.min(propsPerSlot, queueProps.length);
    const startIdx = ((Number.isInteger(config.rotationIndex) ? config.rotationIndex : 0) % queueProps.length + queueProps.length) % queueProps.length;
    const selectedProps = [];
    for (let i = 0; i < n; i++) selectedProps.push(queueProps[(startIdx + i) % queueProps.length]);
    const newRotationIndex = (startIdx + n) % queueProps.length;

    // ── שליחה בפועל ──
    let okCount = 0;
    for (let i = 0; i < recipients.length; i++) {
      const r = recipients[i];
      for (const p of selectedProps) {
        const sent = await ultraSend(r.to, resolveAgentMsg(p, customTexts));
        if (sent.sent) okCount++;
      }
      if (i < recipients.length - 1) await new Promise(rs => setTimeout(rs, 3000));
    }

    // ── עדכון Firestore: סימון "נשלח" + קידום הרוטציה ──
    const newLastSent = { ...lastSent, [slotKey]: {
      agents: targetAgents.length, groups: targetGroups.length, props: selectedProps.length, sentAt: new Date().toISOString(),
    }};
    await fsSetDoc("data/agentAuto", { items: { ...config, lastSent: newLastSent, rotationIndex: newRotationIndex } });

    // ── דיווח למוטי בטלגרם (מידע בלבד, לא בקשת אישור) ──
    const lines = selectedProps.map(fmtPropLine).join("\n");
    await sendTelegram(
      `✅ *אוטומציית מתווכים שלחה אוטומטית* (${slot})\n\n` +
      `📋 נשלח:\n${lines}\n\n` +
      `👤 ${targetAgents.length} מתווכים · 👥 ${targetGroups.length} קבוצות\n` +
      `📤 ${okCount}/${recipients.length * selectedProps.length} הודעות נשלחו בהצלחה`
    );

    return res.status(200).json({
      status: "sent", slot: slotKey, props: selectedProps.length,
      agents: targetAgents.length, groups: targetGroups.length, ok: okCount,
    });
  } catch (e) {
    console.error("cron-agents error:", e);
    return res.status(500).json({ status: "error", message: e.message });
  }
}
