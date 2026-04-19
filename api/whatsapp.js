const fetch = require('node-fetch');
const crypto = require('crypto');

const TELEGRAM_CHAT_ID = "5941736529";
const ULTRAMSG_INSTANCE = process.env.ULTRAMSG_INSTANCE;
const ULTRAMSG_TOKEN = process.env.ULTRAMSG_TOKEN;
const FIREBASE_URL = process.env.FIREBASE_URL;
const CLOUDINARY_CLOUD = process.env.CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_KEY = process.env.CLOUDINARY_API_KEY;
const CLOUDINARY_SECRET = process.env.CLOUDINARY_API_SECRET;
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;

let mottiActive = true;

// ═══ שליחת הודעה דרך UltraMsg ═══
async function sendMessage(chatId, text) {
  await fetch(`https://api.ultramsg.com/${ULTRAMSG_INSTANCE}/messages/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: ULTRAMSG_TOKEN, to: chatId, body: text }),
  });
}

// ═══ Firebase REST ═══
async function fbGet(path) {
  const r = await fetch(`${FIREBASE_URL}/${path}.json`);
  return r.json();
}
async function fbSet(path, data) {
  await fetch(`${FIREBASE_URL}/${path}.json`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}
async function fbPush(path, data) {
  const r = await fetch(`${FIREBASE_URL}/${path}.json`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return r.json();
}
async function fbDelete(path) {
  await fetch(`${FIREBASE_URL}/${path}.json`, { method: 'DELETE' });
}

// ═══ Cloudinary העלאת תמונה ═══
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

// ═══ Claude API פירסור טקסט חופשי ═══
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

// ═══ שדות שאלון ═══
const FIELDS = [
  { key:'city', q:'🏙️ באיזו עיר הנכס?' },
  { key:'street', q:'📍 באיזה רחוב ומספר?' },
  { key:'rooms', q:'🛏️ כמה חדרים?', num:true },
  { key:'floor', q:'🏢 באיזו קומה?', num:true },
  { key:'size_sqm', q:'📐 מה הגודל במ"ר?', num:true },
  { key:'price', q:'💰 מה המחיר המבוקש? (בש"ח)', num:true },
  { key:'contact_name', q:'👤 שם איש/ת הקשר?' },
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
    '✅ *הנכס נשמר בהצלחה!*', '', label, '━━━━━━━━━━━━━━━━',
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

// ═══ בדיקת פולואפ ═══
async function checkFollowUps(chatId) {
  const all = await fbGet('follow_ups');
  if (!all) return;
  const now = Date.now();
  for (const [id, fu] of Object.entries(all)) {
    if (fu.status === 'pending' && new Date(fu.follow_up_at).getTime() <= now) {
      await sendMessage(chatId, [
        '📋 *תזכורת פולואפ!*', '',
        `👤 לקוח/ה: ${fu.client_name}`,
        `📞 ${fu.client_phone}`,
        `🏠 נשלחו ${fu.apartments_sent?.length||0} נכסים לפני 24 שעות`, '',
        '💬 מומלץ ליצור קשר ולברר:',
        '— האם הנכסים מעניינים?',
        '— רוצים לתאם סיור?',
        '— למתי נוח?', '',
        '📌 נא לעדכן סטטוס:',
        `/פולואפ_${id}_סיור`,
        `/פולואפ_${id}_לא`,
        `/פולואפ_${id}_בוצע`,
      ].join('\n'));
      await fbSet(`follow_ups/${id}/status`, 'notified');
    }
  }
}

// ═══ Handler ראשי ═══
export default async function handler(req, res) {
  if (req.method === 'GET') return res.status(200).json({ status: 'ok', active: mottiActive });
  if (req.method !== 'POST') return res.status(200).json({ status: 'ignored' });

  try {
    const update = req.body;
    if (!update.message) return res.status(200).json({ status: 'no message' });

    const msg = update.message;
    const chatId = String(msg.chat.id);
    const text = (msg.text || '').trim();
    const photo = msg.photo;

    if (chatId !== TELEGRAM_CHAT_ID) return res.status(200).json({ status: 'unauthorized' });

    // בדיקת פולואפ בכל קריאה
    await checkFollowUps(chatId);

    // ── תמונה ──
    if (photo && photo.length > 0) {
      const session = await fbGet(`sessions/${chatId}`);
      if (!session?.active) {
        await sendMessage(chatId, '📸 התקבלה תמונה, אבל אין נכס פתוח.\nנא לשלוח /דירה_מוכר או /דירה_מתווך קודם.');
        return res.status(200).json({ status: 'ok' });
      }
      await sendMessage(chatId, '⏳ מעלים תמונה...');
      // לקבל URL של התמונה מטלגרם
      const fileId = photo[photo.length - 1].file_id;
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      const fileInfo = await (await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`)).json();
      const fileUrl = `https://api.telegram.org/file/bot${botToken}/${fileInfo.result.file_path}`;
      const url = await uploadCloudinary(fileUrl);
      if (!url) { await sendMessage(chatId, '❌ שגיאה בהעלאת התמונה. נא לנסות שוב.'); return res.status(200).json({status:'ok'}); }
      const photos = session.apartment.photos || [];
      photos.push(url);
      session.apartment.photos = photos;
      if (session.step !== 'photos') session.step = 'photos';
      await fbSet(`sessions/${chatId}`, session);
      await sendMessage(chatId, `✅ תמונה #${photos.length} הועלתה!\n\n📸 ניתן לשלוח עוד תמונות\n✅ בסיום — נא לשלוח *סיום*`);
      return res.status(200).json({ status: 'ok' });
    }

    // ── פקודות ──
    if (text.startsWith('/')) {
      const parts = text.split(/\s+/);
      const cmd = parts[0].replace('/','');
      const args = text.slice(parts[0].length).trim();

      // פקודות פולואפ דינמיות
      if (cmd.startsWith('פולואפ_')) {
        const m = cmd.match(/^פולואפ_(.+)_(סיור|לא|בוצע)$/);
        if (m) {
          const [, fuId, action] = m;
          const statusMap = { 'סיור':'tour_scheduled', 'לא':'not_interested', 'בוצע':'followed_up' };
          await fbSet(`follow_ups/${fuId}/status`, statusMap[action]);
          const labels = { 'סיור':'✅ תואם סיור!', 'לא':'❌ לא רלוונטי — עודכן.', 'בוצע':'✅ פולואפ בוצע — עודכן.' };
          await sendMessage(chatId, labels[action]);
          if (action === 'סיור') await sendMessage(chatId, '📅 למתי הסיור? (נא לשלוח תאריך)');
          return res.status(200).json({status:'ok'});
        }
      }

      switch(cmd) {
        case 'start':
          await sendMessage(chatId, [
            '🏠 *ברוכים הבאים ל-NadlanPro!*', '',
            'אני מוטי, הבוט החכם לניהול נדל"ן 🤖', '',
            '📌 /דירה_מוכר — הוספת נכס מוכר',
            '📌 /דירה_מתווך — הוספת נכס מתווך',
            '📊 /סטטוס — סטטוס המערכת',
            '📋 /לקוחות — מעקב לקוחות',
            '❓ /עזרה — עזרה', '',
            'יאללה, מתחילים! 💪',
          ].join('\n'));
          break;

        case 'דירה_מוכר':
        case 'דירה_מתווך': {
          const type = cmd === 'דירה_מוכר' ? 'seller' : 'agent';
          const label = type === 'seller' ? 'מוכר' : 'מתווך';
          if (args.length > 10) {
            await sendMessage(chatId, '🧠 מוטי מנתח את הפרטים...');
            const parsed = await parseWithClaude(args);
            if (parsed && (parsed.city || parsed.street || parsed.rooms)) {
              await fbSet(`sessions/${chatId}`, {
                active:true, type, step:'confirm_parsed',
                apartment: { ...parsed, source:type, photos:[], created_at:new Date().toISOString() },
              });
              let p = '🧠 *מוטי זיהה:*\n\n';
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
              await sendMessage(chatId, p);
              break;
            }
          }
          await fbSet(`sessions/${chatId}`, {
            active:true, type, step:FIELDS[0].key,
            apartment: { source:type, photos:[], created_at:new Date().toISOString() },
          });
          await sendMessage(chatId, `📋 *הוספת נכס ${label}*\n\nנא למלא שאלה-שאלה (ניתן לשלוח /ביטול):\n\n${FIELDS[0].q}`);
          break;
        }

        case 'סטטוס': {
          const [sellers, agents] = await Promise.all([fbGet('apartments/seller'), fbGet('apartments/agent')]);
          const sc = sellers ? Object.keys(sellers).length : 0;
          const ac = agents ? Object.keys(agents).length : 0;
          await sendMessage(chatId, [
            '📊 *סטטוס NadlanPro*', '',
            `🏠 נכסי מוכר: ${sc}`, `🤝 נכסי מתווך: ${ac}`, `📦 סה"כ: ${sc+ac}`, '',
            `🕐 ${new Date().toLocaleString('he-IL',{timeZone:'Asia/Jerusalem'})}`,
          ].join('\n'));
          break;
        }

        case 'לקוחות': {
          const fus = await fbGet('follow_ups');
          if (!fus) { await sendMessage(chatId, '📋 אין לקוחות במעקב כרגע.'); break; }
          const pending = Object.entries(fus).filter(([,f]) => ['pending','notified'].includes(f.status));
          if (!pending.length) { await sendMessage(chatId, '✅ אין פולואפ ממתין!'); break; }
          let msg = '📋 *לקוחות ממתינים לפולואפ:*\n\n';
          for (const [id, f] of pending) {
            msg += `👤 ${f.client_name} — 📞 ${f.client_phone}\n`;
            msg += `   🏠 ${f.apartments_sent?.length||0} נכסים | ⏰ ${new Date(f.follow_up_at).toLocaleString('he-IL',{timeZone:'Asia/Jerusalem'})}\n\n`;
          }
          await sendMessage(chatId, msg);
          break;
        }

        case 'שלח_דירות': {
          // פורמט: /שלח_דירות 0501234567 שם_לקוח
          const phone = parts[1];
          const name = parts.slice(2).join(' ');
          if (!phone || !name) {
            await sendMessage(chatId, '📌 פורמט: /שלח_דירות [טלפון] [שם]\nדוגמה: /שלח_דירות 0501234567 דנה כהן');
            break;
          }
          await fbPush('follow_ups', {
            client_name: name, client_phone: phone,
            apartments_sent: [], sent_at: new Date().toISOString(),
            follow_up_at: new Date(Date.now() + 24*60*60*1000).toISOString(),
            status: 'pending', tour_date: null, notes: '',
          });
          await sendMessage(chatId, `✅ נוצר מעקב עבור ${name} (${phone})\n⏰ תזכורת פולואפ תישלח בעוד 24 שעות`);
          break;
        }

        case 'ביטול':
          await fbDelete(`sessions/${chatId}`);
          await sendMessage(chatId, '❌ הפעולה בוטלה.\nנא לשלוח /עזרה לרשימת פקודות.');
          break;

        case 'עזרה':
          await sendMessage(chatId, [
            '❓ *עזרה — מוטי NadlanPro*', '',
            '📌 /דירה_מוכר — הוספת נכס מוכר',
            '📌 /דירה_מתווך — הוספת נכס מתווך',
            '📌 /דירה_מוכר [טקסט חופשי] — הוספה מהירה',
            '📊 /סטטוס — כמה נכסים במערכת',
            '📋 /לקוחות — מעקב לקוחות',
            '📤 /שלח_דירות [טלפון] [שם] — יצירת מעקב',
            '❌ /ביטול — ביטול פעולה נוכחית', '',
            '💡 דוגמה:',
            '/דירה_מוכר 3 חדרים בתל אביב דיזנגוף 99 קומה 5 80 מר 2500000',
          ].join('\n'));
          break;

        default:
          await sendMessage(chatId, `🤷 הפקודה /${cmd} לא מוכרת.\nנא לשלוח /עזרה`);
      }
      return res.status(200).json({ status: 'ok' });
    }

    // ── סשן פעיל (תשובות שאלון) ──
    const session = await fbGet(`sessions/${chatId}`);
    if (session?.active) {
      const lower = text.trim();

      if (lower === 'ביטול') {
        await fbDelete(`sessions/${chatId}`);
        await sendMessage(chatId, '❌ בוטל.');
        return res.status(200).json({status:'ok'});
      }

      // confirm_parsed
      if (session.step === 'confirm_parsed') {
        if (['אישור','כן','ok','yes'].includes(lower)) {
          session.step = 'photos';
          await fbSet(`sessions/${chatId}`, session);
          await sendMessage(chatId, '👍 מעולה!\n\n📸 נא לשלוח תמונות של הנכס.\nבסיום — נא לשלוח *סיום*.');
        } else if (['תיקון','edit','לא'].includes(lower)) {
          session.step = FIELDS[0].key;
          await fbSet(`sessions/${chatId}`, session);
          await sendMessage(chatId, `📝 עוברים שאלה-שאלה:\n\n${FIELDS[0].q}`);
        } else {
          await sendMessage(chatId, 'נא לשלוח *אישור* או *תיקון*');
        }
        return res.status(200).json({status:'ok'});
      }

      // photos
      if (session.step === 'photos') {
        if (['סיום','done','שמור','save'].includes(lower)) {
          const { type, apartment } = session;
          await fbPush(`apartments/${type}`, apartment);
          await fbDelete(`sessions/${chatId}`);
          await sendMessage(chatId, formatSummary(apartment, type));
        } else {
          await sendMessage(chatId, '📸 נא לשלוח תמונות, או *סיום* לשמירה.');
        }
        return res.status(200).json({status:'ok'});
      }

      // שאלון רגיל
      const idx = FIELDS.findIndex(f => f.key === session.step);
      if (idx === -1) {
        session.step = 'photos';
        await fbSet(`sessions/${chatId}`, session);
        await sendMessage(chatId, '📸 נא לשלוח תמונות, או *סיום* לשמירה.');
        return res.status(200).json({status:'ok'});
      }
      session.apartment[FIELDS[idx].key] = processVal(FIELDS[idx], text);
      if (idx + 1 < FIELDS.length) {
        session.step = FIELDS[idx+1].key;
        await fbSet(`sessions/${chatId}`, session);
        await sendMessage(chatId, `✅ ${FIELDS[idx+1].q}`);
      } else {
        session.step = 'photos';
        await fbSet(`sessions/${chatId}`, session);
        await sendMessage(chatId, '✅ כל הפרטים התקבלו!\n\n📸 נא לשלוח תמונות של הנכס.\nבסיום — נא לשלוח *סיום*.');
      }
      return res.status(200).json({status:'ok'});
    }

    // ── הודעה חופשית ──
    await sendMessage(chatId, '🤖 מוטי כאן!\n\nההודעה לא זוהתה 😅\nנא לשלוח /עזרה לרשימת פקודות.');
    return res.status(200).json({ status: 'ok' });

  } catch(err) {
    console.error('❌ שגיאה:', err);
    return res.status(200).json({ error: err.message });
  }
}
