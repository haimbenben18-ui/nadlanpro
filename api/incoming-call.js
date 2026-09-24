// ═══════════════════════════════════════════════════════════════════════
// Webhook for an incoming phone call, fired by an Android automation app
// (e.g. MacroDroid) the moment a call comes in from a number not already
// known in the CRM. GET-based so it's easy to configure as a URL action in
// MacroDroid, no request body needed.
//
//   GET /api/incoming-call?phone=0501234567&secret=<INCOMING_CALL_SECRET>
//
// Flow:
//   1. Validate the shared secret (cheap protection — this URL is public).
//   2. Normalize the phone number.
//   3. Check it against buyers / sellers / brokerProps / agentsContacts —
//      if it's already known, do nothing (no Telegram spam).
//   4. If genuinely unknown, and there isn't already an open prompt for
//      this exact number, start a Telegram session asking Motti whether to
//      add it as a new buyer. api/whatsapp.js's `buyer_call` session branch
//      picks up the conversation from there.
// ═══════════════════════════════════════════════════════════════════════

import { fsGetDoc } from './_lib/firestore.js';
import { fbGet, fbSet, fbPush } from './_lib/firebase.js';
import { normalizePhone } from './_lib/phone.js';

const TELEGRAM_CHAT_ID = "5941736529";
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const INCOMING_CALL_SECRET = process.env.INCOMING_CALL_SECRET;

async function sendTelegram(text) {
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: 'Markdown' }),
  });
}

function collectPhones(doc) {
  const items = Array.isArray(doc && doc.items) ? doc.items : [];
  return items.map(x => normalizePhone(x && x.phone)).filter(Boolean);
}

export default async function handler(req, res) {
  try {
    const phoneRaw = req.query.phone;
    const secret   = req.query.secret;

    if (!INCOMING_CALL_SECRET || secret !== INCOMING_CALL_SECRET) {
      return res.status(401).json({ status: 'unauthorized' });
    }

    const phone = normalizePhone(phoneRaw);
    if (!phone) {
      return res.status(400).json({ status: 'bad_phone' });
    }

    // ── כבר מוכר במערכת? לא עושים כלום ──
    const [buyersDoc, sellersDoc, brokerDoc, agentsDoc] = await Promise.all([
      fsGetDoc('data/buyers'),
      fsGetDoc('data/sellers'),
      fsGetDoc('data/brokerProps'),
      fsGetDoc('data/agentsContacts'),
    ]);
    const known = new Set([
      ...collectPhones(buyersDoc),
      ...collectPhones(sellersDoc),
      ...collectPhones(brokerDoc),
      ...collectPhones(agentsDoc),
    ]);
    if (known.has(phone)) {
      return res.status(200).json({ status: 'known' });
    }

    // ── כבר יש שיחה פתוחה על המספר הזה? לא שולחים שוב ──
    const existing = await fbGet(`sessions/${TELEGRAM_CHAT_ID}`);
    if (existing && existing.type === 'buyer_call' && existing.phone === phone) {
      return res.status(200).json({ status: 'already_pending' });
    }

    // ── מספר לא מוכר — שמירה ב-incoming_calls + פתיחת שיחה בטלגרם ──
    const callTime = new Date().toISOString();
    await Promise.all([
      // נשמר ב-incoming_calls/ — האפליקציה קוראת משם ומציגה התראה
      fbPush('incoming_calls', {
        phone,
        time: callTime,
        status: 'pending',
      }),
      // סשן לטלגרם
      fbSet(`sessions/${TELEGRAM_CHAT_ID}`, {
        active: true,
        type: 'buyer_call',
        step: 'confirm',
        phone,
        created_at: callTime,
      }),
    ]);
    await sendTelegram(`📞 שיחה נכנסת ממספר לא מוכר: *${phone}*\n\nלהוסיף כקונה חדש? (כן / לא)`);

    return res.status(200).json({ status: 'prompted', phone });
  } catch (e) {
    console.error('incoming-call error:', e);
    return res.status(500).json({ status: 'error', message: e.message });
  }
}
