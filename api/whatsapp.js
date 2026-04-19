import crypto from 'crypto';

const TELEGRAM_CHAT_ID = "5941736529";
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const FIREBASE_URL = process.env.FIREBASE_URL;
const CLOUDINARY_CLOUD = process.env.CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_KEY = process.env.CLOUDINARY_API_KEY;
const CLOUDINARY_SECRET = process.env.CLOUDINARY_API_SECRET;
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;

// ═══ שליחה בטלגרם (לא UltraMsg!) ═══
async function sendTelegram(chatId, text) {
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
  });
}

// ═══ Firebase REST ═══
async function fbGet(path) {
  const r = await fetch(`${FIREBASE_URL}/${path}.json`);
  return r.json();
}
async function fbSet(path, data) {
  await fetch(`${FIREBASE_URL}/${path}.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}
async function fbPush(path, data) {
  const r = await fetch(`${FIREBASE_URL}/${path}.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return r.json();
}
async function fbDelete(path) {
  await fetch(`${FIREBASE_URL}/${path}.json`, { method: 'DELETE' });
}

// ═══ בדיקת שעות פעילות ושבת/חגים ═══
function isWorkingHours() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
  const hour = now.getHours();
  const min = now.getMinutes();
  const current = hour * 60 + min;
  // 08:19 עד 20:00
  return current >= 499 && current <= 1200;
}

function isShabbatOrHoliday() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
  const day = now.getDay();
  // שבת: שישי אחרי 16:00 עד מוצ"ש
  if (day === 6) return true; // שבת
  if (day === 5 && now.getHours() >= 16) return true; // ערב שבת

  // חגים 2025-2026 (תאריכים לועזיים משוערים)
  const mmdd = `${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  const holidays = [
    // ראש השנה 2025
    '09-22','09-23','09-24',
    // יום כיפור 2025
    '10-01','10-02',
    // סוכות 2025
    '10-06','10-07','10-13','10-14',
    // חנוכה 2025
    '12-14','12-15','12-16','12-17','12-18','12-19','12-20','12-21','12-22',
    // פורים 2026
    '03-03','03-04',
    // פסח 2026
    '03-31','04-01','04-06','04-07',
    // יום הזיכרון + יום העצמאות 2026
    '04-21','04-22',
    // יום השואה 2026
    '04-13',
    // שבועות 2026
    '05-21','05-22',
    // תשעה באב 2026
    '07-26',
    // ראש השנה 2026
    '09-11','09-12','09-13',
    // יום כיפור 2026
    '09-20','09-21',
  ];
  return holidays.includes(mmdd);
}

// true = מותר לשלוח הודעות החוצה (לא למנהל)
function canSendExternal() {
  return isWorkingHours() && !isShabbatOrHoliday();
}

// ═══ Cloudinary ═══
async function uploadCloudinary(imageUrl) {
  const ts = Math.floor(Date.now() / 1000);
  const sig = crypto.createHash('sha1')
    .update(`folder=nadlanpro&timestamp=${ts}${CLOUDINARY_SECRET}`)
    .digest('hex');
  const r = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      file: imageUrl, api_key: CLOUDINARY_KEY,
      timestamp: String(ts), signature: sig, folder: 'nadlanpro',
    }).toString(),
  });
  const d = await r.json();
  return d.secure_url || null;
}

// ═══ Claude API ═══
async function parseWithClaude(text) {
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514', max_tokens: 500,
        messages: [{ role: 'user', content:
          `חלץ פרטי נכס מהטקסט. החזר JSON בלבד בלי markdown:\n{"city":"","street":"","rooms":null,"floor":null,"size_sqm":null,"price":null,"contact_name":"","contact_phone":"","notes":""}\nשדה חסר = null. מחיר = מספר בלבד.\n\nטקסט: "${text}"` }],
      }),
    });
    const d = await r.json();
    const c = (d.content?.[0]?.text || '{}').replace(/```json\s*/g,'').replace(/```/g,'').trim();
    return JSON.parse(c);
  } catch(e) { return null; }
}

// ═══ שדות שאלון (יוניסקס) ═══
const FIELDS = [
  { key:'city', q:'🏙️ באיזו עיר הנכס?' },
  { key:'street', q:'📍 באיזה רחוב ומספר?' },
  { key:'rooms', q:'🛏️ כמה חדרים?', num:true },
  { key:'floor', q:'🏢 באיזו קומה?', num:true },
  { key:'size_sqm', q:'📐 מה הגודל במ"ר?', num:true },
  { key:'price', q:'💰 מה המחיר המבוקש? (בש"ח)', num:true },
  { key:'contact_name', q:'👤 שם ליצירת קשר?' },
  { key:'contact_phone', q:'📞 טלפון ליצירת קשר?' },
  { key:'notes', q:'📝 הערות נוספות? (או "דלג")' },
];

function processVal(field, text) {
  if (text === 'דלג' || text === 'skip') return '';
  if (field.num) { const n = parseFloat(text.replace(/[^\d.]/g,'')); return isNaN(n) ? text : n; }
  return text;
}

function formatSummary(apt, type) {
  const label = type === 'seller' ? '🏠 נכס מוכר' : '🤝 נכס מתווך';
  const price = typeof apt.price === 'number' ? apt.price.toLocaleString('he-IL') + ' ₪' : apt.price || '—';
  return [
    '✅ הנכס נשמר בהצלחה!', '', label, '━━━━━━━━━━━━━━━━',
    `🏙️ עיר: ${apt.city||'—'}`, `📍 רחוב: ${apt.street||'—'}`,
    `🛏️ חדרים: ${apt.rooms||'—'}`, `🏢 קומה: ${apt.floor||'—'}`,
    `📐 גודל: ${apt.size_sqm ? apt.size_sqm+' מ"ר' : '—'}`,
    `💰 מחיר: ${price}`, `👤 קשר: ${apt.contact_name||'—'}`,
    `📞 טלפון: ${apt.contact_phone||'—'}`,
    apt.notes ? `📝 הערות: ${apt.notes}` : null,
    `📸 תמונות: ${apt.photos?.length||0}`, '━━━━━━━━━━━━━━━━',
    `🕐 ${new Date().toLocaleString('he-IL',{timeZone:'Asia/Jerusalem'})}`,
  ].filter(Boolean).join('\n');
}

// ═══ Handler ראשי ═══
export default async function handler(req, res) {
  if (req.method === 'GET') {
    const active = await fbGet('settings/mottiActive');
    return res.status(200).json({ status: 'ok', active: active !== false });
  }
  if (req.method !== 'POST') return res.status(200).json({ status: 'ignored' });

  try {
    const update = req.body;
    if (!update.message) return res.status(200).json({ status: 'no message' });

    const msg = update.message;
    const chatId = String(msg.chat.id);
    const text = (msg.text || '').trim();
    const photo = msg.photo;

    // רק אני
    if (chatId !== TELEGRAM_CHAT_ID) return res.status(200).json({ status: 'unauthorized' });

    // בדיקה אם מוטי פעיל (מ-Firebase)
    const mottiActive = await fbGet('settings/mottiActive');
    if (mottiActive === false && text !== '/on') {
      if (text === '/status') {
        await sendTelegram(chatId, '😴 מוטי כבוי כרגע.\nנא לשלוח /on להפעלה.');
      }
      return res.status(200).json({ status: 'motti_off' });
    }

    // ── תמונה ──
    if (photo && photo.length > 0) {
      const session = await fbGet(`sessions/${chatId}`);
      if (!session?.active) {
        await sendTelegram(chatId, '📸 התקבלה תמונה, אבל אין נכס פתוח.\nנא לשלוח /דירה\\_מוכר או /דירה\\_מתווך קודם.');
        return res.status(200).json({ status: 'ok' });
      }
      await sendTelegram(chatId, '⏳ מעלים תמונה...');
      const fileId = photo[photo.length - 1].file_id;
      const fileInfo = await (await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`)).json();
      const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${fileInfo.result.file_path}`;
      const url = await uploadCloudinary(fileUrl);
      if (!url) {
        await sendTelegram(chatId, '❌ שגיאה בהעלאת התמונה. נא לנסות שוב.');
        return res.status(200).json({ status: 'ok' });
      }
      const photos = session.apartment.photos || [];
      photos.push(url);
      session.apartment.photos = photos;
      if (session.step !== 'photos') session.step = 'photos';
      await fbSet(`sessions/${chatId}`, session);
      await sendTelegram(chatId, `✅ תמונה #${photos.length} הועלתה!\n\n📸 ניתן לשלוח עוד תמונות\n✅ בסיום — נא לשלוח סיום`);
      return res.status(200).json({ status: 'ok' });
    }

    // ── פקודות ──
    if (text.startsWith('/')) {
      const parts = text.split(/\s+/);
      const cmd = parts[0].replace('/','');
      const args = text.slice(parts[0].length).trim();

      switch(cmd) {
        case 'start':
          await sendTelegram(chatId, [
            '🏠 ברוכים הבאים ל-NadlanPro!', '',
            'אני מוטי, הבוט החכם לניהול נדל"ן 🤖', '',
            '📌 /דירה\\_מוכר — הוספת נכס מוכר',
            '📌 /דירה\\_מתווך — הוספת נכס מתווך',
            '📊 /סטטוס — סטטוס המערכת',
            '🔛 /on 😴 /off — הפעלה/כיבוי',
            '❓ /עזרה — עזרה', '',
            'יאללה, מתחילים! 💪',
          ].join('\n'));
          break;

        case 'on':
          await fbSet('settings/mottiActive', true);
          await sendTelegram(chatId, '🟢 מוטי פעיל!');
          break;

        case 'off':
          await fbSet('settings/mottiActive', false);
          await sendTelegram(chatId, '🔴 מוטי כבוי. נא לשלוח /on להפעלה.');
          break;

        case 'דירה_מוכר':
        case 'דירה_מתווך': {
          const type = cmd === 'דירה_מוכר' ? 'seller' : 'agent';
          const label = type === 'seller' ? 'מוכר' : 'מתווך';

          if (args.length > 10) {
            await sendTelegram(chatId, '🧠 מוטי מנתח את הפרטים...');
            const parsed = await parseWithClaude(args);
            if (parsed && (parsed.city || parsed.street || parsed.rooms)) {
              await fbSet(`sessions/${chatId}`, {
                active:true, type, step:'confirm_parsed',
                apartment: { ...parsed, source:type, photos:[], created_at:new Date().toISOString() },
              });
              let p = '🧠 מוטי זיהה:\n\n';
              if (parsed.city) p += `🏙️ עיר: ${parsed.city}\n`;
              if (parsed.street) p += `📍 רחוב: ${parsed.street}\n`;
              if (parsed.rooms) p += `🛏️ חדרים: ${parsed.rooms}\n`;
              if (parsed.floor) p += `🏢 קומה: ${parsed.floor}\n`;
              if (parsed.size_sqm) p += `📐 גודל: ${parsed.size_sqm} מ"ר\n`;
              if (parsed.price) p += `💰 מחיר: ${Number(parsed.price).toLocaleString('he-IL')} ₪\n`;
              if (parsed.contact_name) p += `👤 קשר: ${parsed.contact_name}\n`;
              if (parsed.contact_phone) p += `📞 טלפון: ${parsed.contact_phone}\n`;
              if (parsed.notes) p += `📝 ${parsed.notes}\n`;
              p += '\n✅ נא לשלוח *אישור* לשמור\n✏️ או *תיקון* למילוי שאלה-שאלה';
              await sendTelegram(chatId, p);
              break;
            }
          }

          await fbSet(`sessions/${chatId}`, {
            active:true, type, step:FIELDS[0].key,
            apartment: { source:type, photos:[], created_at:new Date().toISOString() },
          });
          await sendTelegram(chatId, `📋 הוספת נכס ${label}\n\nנא למלא שאלה-שאלה (/ביטול לביטול):\n\n${FIELDS[0].q}`);
          break;
        }

        case 'סטטוס': {
          const active = await fbGet('settings/mottiActive');
          const [sellers, agents] = await Promise.all([fbGet('apartments/seller'), fbGet('apartments/agent')]);
          const sc = sellers ? Object.keys(sellers).length : 0;
          const ac = agents ? Object.keys(agents).length : 0;
          const timeOk = canSendExternal();
          await sendTelegram(chatId, [
            '📊 סטטוס NadlanPro', '',
            `🤖 מוטי: ${active !== false ? '🟢 פעיל' : '🔴 כבוי'}`,
            `⏰ שליחה החוצה: ${timeOk ? '✅ מותר' : '🚫 מחוץ לשעות'}`,
            `🏠 נכסי מוכר: ${sc}`,
            `🤝 נכסי מתווך: ${ac}`,
            `📦 סה"כ: ${sc+ac}`, '',
            `🕐 ${new Date().toLocaleString('he-IL',{timeZone:'Asia/Jerusalem'})}`,
          ].join('\n'));
          break;
        }

        case 'ביטול':
          await fbDelete(`sessions/${chatId}`);
          await sendTelegram(chatId, '❌ הפעולה בוטלה.\nנא לשלוח /עזרה לרשימת פקודות.');
          break;

        case 'עזרה':
          await sendTelegram(chatId, [
            '❓ עזרה — מוטי NadlanPro', '',
            '📌 /דירה\\_מוכר — הוספת נכס מוכר',
            '📌 /דירה\\_מתווך — הוספת נכס מתווך',
            '📌 /דירה\\_מוכר [טקסט חופשי] — הוספה מהירה',
            '📊 /סטטוס — סטטוס המערכת',
            '🔛 /on — הפעלת מוטי',
            '😴 /off — כיבוי מוטי',
            '❌ /ביטול — ביטול פעולה נוכחית', '',
            '💡 דוגמה:',
            '/דירה\\_מוכר 3 חדרים בבאר שבע רינגלבלום 5 קומה 3 85 מר 1200000',
          ].join('\n'));
          break;

        default:
          await sendTelegram(chatId, `🤷 הפקודה /${cmd} לא מוכרת.\nנא לשלוח /עזרה`);
      }
      return res.status(200).json({ status: 'ok' });
    }

    // ── סשן פעיל ──
    const session = await fbGet(`sessions/${chatId}`);
    if (session?.active) {
      const lower = text.trim();

      if (lower === 'ביטול') {
        await fbDelete(`sessions/${chatId}`);
        await sendTelegram(chatId, '❌ בוטל.');
        return res.status(200).json({ status: 'ok' });
      }

      if (session.step === 'confirm_parsed') {
        if (['אישור','כן','ok','yes'].includes(lower)) {
          session.step = 'photos';
          await fbSet(`sessions/${chatId}`, session);
          await sendTelegram(chatId, '👍 מעולה!\n\n📸 נא לשלוח תמונות של הנכס.\nבסיום — נא לשלוח *סיום*.');
        } else if (['תיקון','edit','לא'].includes(lower)) {
          session.step = FIELDS[0].key;
          await fbSet(`sessions/${chatId}`, session);
          await sendTelegram(chatId, `📝 עוברים שאלה-שאלה:\n\n${FIELDS[0].q}`);
        } else {
          await sendTelegram(chatId, 'נא לשלוח *אישור* או *תיקון*');
        }
        return res.status(200).json({ status: 'ok' });
      }

      if (session.step === 'photos') {
        if (['סיום','done','שמור','save'].includes(lower)) {
          const { type, apartment } = session;
          await fbPush(`apartments/${type}`, apartment);
          await fbDelete(`sessions/${chatId}`);
          await sendTelegram(chatId, formatSummary(apartment, type));
        } else {
          await sendTelegram(chatId, '📸 נא לשלוח תמונות, או *סיום* לשמירה.');
        }
        return res.status(200).json({ status: 'ok' });
      }

      const idx = FIELDS.findIndex(f => f.key === session.step);
      if (idx === -1) {
        session.step = 'photos';
        await fbSet(`sessions/${chatId}`, session);
        await sendTelegram(chatId, '📸 נא לשלוח תמונות, או *סיום* לשמירה.');
        return res.status(200).json({ status: 'ok' });
      }
      session.apartment[FIELDS[idx].key] = processVal(FIELDS[idx], text);
      if (idx + 1 < FIELDS.length) {
        session.step = FIELDS[idx+1].key;
        await fbSet(`sessions/${chatId}`, session);
        await sendTelegram(chatId, `✅ ${FIELDS[idx+1].q}`);
      } else {
        session.step = 'photos';
        await fbSet(`sessions/${chatId}`, session);
        await sendTelegram(chatId, '✅ כל הפרטים התקבלו!\n\n📸 נא לשלוח תמונות של הנכס.\nבסיום — נא לשלוח *סיום*.');
      }
      return res.status(200).json({ status: 'ok' });
    }

    // ── הודעה חופשית ──
    await sendTelegram(chatId, '🤖 מוטי כאן!\n\nההודעה לא זוהתה 😅\nנא לשלוח /עזרה לרשימת פקודות.');
    return res.status(200).json({ status: 'ok' });

  } catch(err) {
    console.error('שגיאה:', err);
    return res.status(200).json({ error: err.message });
  }
}
