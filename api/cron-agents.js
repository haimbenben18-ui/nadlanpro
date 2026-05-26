// Vercel Cron job — fires at 09:00 and 14:00 Israel time (06:00 / 11:00 UTC).
// Reads the agent-automation queue from Firestore and pings Motti on Telegram
// asking for explicit approval. Nothing is sent to agents without the human
// replying "שלח למתווכים" in Telegram (handled by api/whatsapp.js).

const TELEGRAM_CHAT_ID = "5941736529";
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const FIRESTORE_PROJECT = process.env.FIRESTORE_PROJECT || "nadlanpro-5b041";
const FIRESTORE_KEY     = process.env.FIRESTORE_API_KEY || "AIzaSyBAD_k4u-8hXNb4VMMiDOoPvJ17wVZW9ew";

// ───────── Firestore REST helpers ─────────
function decodeValue(v) {
  if (!v) return null;
  if (v.stringValue   !== undefined) return v.stringValue;
  if (v.integerValue  !== undefined) return parseInt(v.integerValue, 10);
  if (v.doubleValue   !== undefined) return v.doubleValue;
  if (v.booleanValue  !== undefined) return v.booleanValue;
  if (v.nullValue     !== undefined) return null;
  if (v.timestampValue!== undefined) return v.timestampValue;
  if (v.arrayValue)   return (v.arrayValue.values || []).map(decodeValue);
  if (v.mapValue)     return decodeFields(v.mapValue.fields || {});
  return null;
}
function decodeFields(fields) {
  const o = {};
  for (const [k, v] of Object.entries(fields || {})) o[k] = decodeValue(v);
  return o;
}
async function fsGetDoc(docPath) {
  const url = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT}/databases/(default)/documents/${docPath}?key=${FIRESTORE_KEY}`;
  const r = await fetch(url);
  if (!r.ok) {
    console.warn("fsGetDoc failed", docPath, r.status);
    return null;
  }
  const j = await r.json();
  return j && j.fields ? decodeFields(j.fields) : null;
}

// ───────── Telegram ─────────
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

// ───────── Time helpers ─────────
function israelNow() {
  const s = new Date().toLocaleString("en-US", { timeZone: "Asia/Jerusalem" });
  return new Date(s);
}
function todayKey() { return israelNow().toISOString().slice(0, 10); }
function nearestSendSlot(sendTimes) {
  // Pick the most recent send-time today that has already passed (within 90 min).
  const now = israelNow();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  let best = null;
  for (const t of sendTimes) {
    const [h, m] = t.split(":").map(Number);
    const tMin = h * 60 + m;
    if (nowMin >= tMin && nowMin - tMin <= 90) {
      if (!best || tMin > best.tMin) best = { t, tMin };
    }
  }
  return best ? best.t : null;
}

// ───────── Property summary ─────────
function fmtProp(p, i) {
  const street = p.address || p.name || "—";
  const city   = p.city || "באר שבע";
  const rooms  = p.rooms ? `${p.rooms} חד'` : "—";
  const priceN = Number(p.price);
  const price  = (p.price && !isNaN(priceN)) ? `${priceN.toLocaleString()} ₪` : "—";
  return `${i + 1}. ${street}, ${city} — ${rooms} — ${price}`;
}

// ───────── Handler ─────────
export default async function handler(req, res) {
  try {
    // Pull the automation config + property collections
    const auto       = (await fsGetDoc("data/agentAuto"))      || {};
    const sellersDoc = (await fsGetDoc("data/sellers"))        || {};
    const brokerDoc  = (await fsGetDoc("data/brokerProps"))    || {};

    // The web app wraps payload under .items
    const config  = (auto.items     && typeof auto.items === "object" && !Array.isArray(auto.items)) ? auto.items : {};
    const sellers = Array.isArray(sellersDoc.items) ? sellersDoc.items : [];
    const broker  = Array.isArray(brokerDoc.items)  ? brokerDoc.items  : [];
    const queue   = Array.isArray(config.items) ? config.items : [];
    const sendTimes = Array.isArray(config.sendTimes) ? config.sendTimes : ["09:00", "14:00"];
    const lastSent  = config.lastSent || {};
    const skipped   = config.skippedToday || {};

    const slot = nearestSendSlot(sendTimes);
    if (!slot) {
      return res.status(200).json({ status: "no_active_slot" });
    }
    const dayKey = todayKey();
    const slotKey = `${dayKey}_${slot}`;
    if (lastSent[slotKey] || skipped[slotKey]) {
      return res.status(200).json({ status: "already_handled", slot: slotKey });
    }

    // Resolve properties from queue references
    const all = [
      ...sellers.map(s => ({ ...s, _src: "s" })),
      ...broker .map(p => ({ ...p, _src: "b" })),
    ];
    const props = queue
      .map(it => all.find(p => p.id === it.propId && p._src === it.propSrc))
      .filter(Boolean);

    if (props.length === 0) {
      return res.status(200).json({ status: "queue_empty" });
    }

    const lines = props.map(fmtProp).join("\n");
    const msg =
      `🔔 הגיע זמן שליחה למתווכים! (${slot})\n\n` +
      `📋 דירות מוכנות לשליחה:\n${lines}\n\n` +
      `✅ נא לשלוח 'שלח למתווכים' לאישור\n` +
      `❌ או 'דלג' לביטול`;

    const ok = await sendTelegram(msg);
    return res.status(200).json({ status: ok ? "telegram_sent" : "telegram_failed", slot, props: props.length });
  } catch (e) {
    console.error("cron-agents error:", e);
    return res.status(500).json({ status: "error", message: e.message });
  }
}
