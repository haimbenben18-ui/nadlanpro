import crypto from 'crypto';

const TELEGRAM_CHAT_ID = "5941736529";
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const FIREBASE_URL = process.env.FIREBASE_URL;
const CLOUDINARY_CLOUD = process.env.CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_KEY = process.env.CLOUDINARY_API_KEY;
const CLOUDINARY_SECRET = process.env.CLOUDINARY_API_SECRET;
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;

// ═══ שליחה בטלגרם ═══
async function sendTelegram(chatId, text) {
  const resp = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
  });
  return resp.json();
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

// ═══ שעות פעילות ושבת/חגים ═══
function isWorkingHours() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
  const current = now.getHours() * 60 + now.getMinutes();
  return current >= 499 && current <= 1200;
}

function isShabbatOrHoliday() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
  const day = now.getDay();
  if (day === 6) return true;
  if (day === 5 && now.getHours() >= 16) return true;
  const mmdd = `${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  const holidays = [
    '09-22','09-23','09-24','10-01','10-02','10-06','10-07','10-13','10-14',
    '12-14','12-15','12-16','12-17','12-18','12-19','12-20','12-21','12-22',
    '03-03','03-04','03-31','04-01','04-06','04-07','04-21','04-22','04-13',
    '05-21','05-22','07-26','09-11','09-12','09-13','09-20','09-21',
  ];
  return holidays.includes(mmdd);
}

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

// ═══ Claude — פירסור פרטי נכס ═══
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
        model: 'claude-sonnet-4-20250514', max_tokens: 600,
        messages: [{ role: 'user', content:
          `חלץ פרטי נכס מהטקסט. החזר JSON בלבד, ללא markdown וללא הסברים:\n` +
          `{"city":"","street":"","rooms":null,"floor":null,"size_sqm":null,"price":null,"contact_name":"","contact_phone":"","notes":""}\n` +
          `חוקים: שדה חסר = null. מחיר = מספר שלם בלבד (ללא פסיקים). rooms = מספר עשרוני מותר (3.5).\n\n` +
          `טקסט: "${text}"` }],
      }),
    });
    const d = await r.json();
    const raw = d.content?.[0]?.text || '{}';
    const clean = raw.replace(/```json\s*/g,'').replace(/```/g,'').trim();
    return JSON.parse(clean);
  } catch(e) {
    console.error('parseWithClaude error:', e);
    return null;
  }
}

// ═══ Claude — יצירת טקסט פרסום ═══
async function generatePromoWithClaude(apt) {
  try {
    const price = typeof apt.price === 'number'
      ? apt.price.toLocaleString('he-IL')
      : (apt.price || '');
    const lines = [
      apt.city        ? `עיר: ${apt.city}` : null,
      apt.street      ? `רחוב: ${apt.street}` : null,
      apt.rooms       ? `חדרים: ${apt.rooms}` : null,
      apt.floor != null ? `קומה: ${apt.floor}` : null,
      apt.size_sqm    ? `גודל: ${apt.size_sqm} מ"ר` : null,
      price           ? `מחיר: ${price} ₪` : null,
      apt.contact_phone ? `טלפון: ${apt.contact_phone}` : null,
      apt.notes       ? `הערות: ${apt.notes}` : null,
    ].filter(Boolean).join('\n');

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
          `צור טקסט פרסום לווטסאפ עבור דירה למכירה.\n` +
          `החזר רק את הטקסט המוגמר, ללא הסברים נוספים.\n` +
          `שפה יוניסקס. השמט שורות של שדות חסרים. השתמש בדיוק בפורמט הזה:\n\n` +
          `🏠 דירה למכירה!\n` +
          `📍 [עיר], [רחוב]\n` +
          `🛏️ [חדרים] חדרים | 🏢 קומה [X]\n` +
          `📐 [גודל] מ"ר\n` +
          `💰 [מחיר] ₪\n` +
          `📝 [הערות - רק אם יש]\n` +
          `📞 לפרטים: חיים בן סימון\n` +
          `RE/MAX באר שבע\n\n` +
          `פרטי הנכס:\n${lines}` }],
      }),
    });
    const d = await r.json();
    return (d.content?.[0]?.text || '').trim();
  } catch(e) {
    console.error('generatePromoWithClaude error:', e);
    return null;
  }
}

// ═══ Claude — תיקון פרסום ═══
async function fixPromoWithClaude(currentPromo, fixRequest) {
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
          `הנה טקסט פרסום נדל"ן:\n\n${currentPromo}\n\n` +
          `בקשת תיקון: "${fixRequest}"\n\n` +
          `החזר רק את הטקסט המתוקן, ללא הסברים. שמור על אותו פורמט ואימוג'ים. שפה יוניסקס.` }],
      }),
    });
    const d = await r.json();
    return (d.content?.[0]?.text || '').trim();
  } catch(e) {
    console.error('fixPromoWithClaude error:', e);
    return null;
  }
}

// ═══ זיהוי פקודות — עברית טבעית + slash ═══
// מחזיר: { cmd, type, args } או null
function detectIntent(text) {
  const t = text.trim();

  // slash commands
  if (t === '/start')          return { cmd: 'start' };
  if (t === '/on')             return { cmd: 'on' };
  if (t === '/off')            return { cmd: 'off' };
  if (t === '/עזרה' || t === '/help') return { cmd: 'עזרה' };
  if (t === '/ביטול')          return { cmd: 'ביטול' };
  if (t === '/סטטוס' || t === '/status') return { cmd: 'סטטוס' };

  // slash + type
  const slashSeller = t.match(/^\/דירה[_\s]מוכר(.*)?$/i);
  if (slashSeller) return { cmd: 'דירה', type: 'seller', args: (slashSeller[1] || '').trim() };
  const slashAgent = t.match(/^\/דירה[_\s]מתווך(.*)?$/i);
  if (slashAgent)  return { cmd: 'דירה', type: 'agent', args: (slashAgent[1] || '').trim() };

  // עברית טבעית — on/off/status
  if (/^(הפעל|תפעיל|הדלק|תדליק)$/.test(t))  return { cmd: 'on' };
  if (/^(כבה|תכבה|כיבוי|עצור)$/.test(t))     return { cmd: 'off' };
  if (/^(סטטוס|מצב|מה קורה)$/.test(t))       return { cmd: 'סטטוס' };
  if (/^(עזרה|עזור|מה אתה יודע|פקודות)$/.test(t)) return { cmd: 'עזרה' };
  if (/^(ביטול|בטל|עזוב|בלי|לא)$/.test(t))   return { cmd: 'ביטול' };

  // עברית טבעית — דירה מוכר/מתווך
  // מזהה: [פועל אופציונלי] דיר(ה/ת) מוכר/מתווך [שאר]
  const sellerMatch = t.match(/^(?:תוסיף|הוסף|תכניס|הכנס|תרשום|רשום|הכניס)?\s*דיר[הת]\s+מוכר(?:\s+(.*))?$/i);
  if (sellerMatch) return { cmd: 'דירה', type: 'seller', args: (sellerMatch[1] || '').trim() };

  const agentMatch = t.match(/^(?:תוסיף|הוסף|תכניס|הכנס|תרשום|רשום|הכניס)?\s*דיר[הת]\s+מתווך(?:\s+(.*))?$/i);
  if (agentMatch) return { cmd: 'דירה', type: 'agent', args: (agentMatch[1] || '').trim() };

  return null;
}

// ═══ שדות קריטיים חסרים ═══
const CRITICAL_FIELDS = [
  { key: 'city',  q: '🏙️ באיזו עיר הנכס?' },
  { key: 'rooms', q: '🛏️ כמה חדרים?' },
  { key: 'price', q: '💰 מה המחיר המבוקש? (מספר בלבד, בש"ח)' },
];

function getMissingCritical(apt) {
  return CRITICAL_FIELDS.filter(f => !apt[f.key]);
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

    const msg    = update.message;
    const chatId = String(msg.chat.id);
    const text   = (msg.text    || '').trim();
    const caption= (msg.caption || '').trim();
    const photo  = msg.photo;

    if (chatId !== TELEGRAM_CHAT_ID) return res.status(200).json({ status: 'unauthorized' });

    // ── בדיקה אם מוטי פעיל ──
    const mottiActive = await fbGet('settings/mottiActive');
    const intent = detectIntent(text);

    if (mottiActive === false && intent?.cmd !== 'on') {
      if (intent?.cmd === 'סטטוס') {
        await sendTelegram(chatId, '😴 מוטי כבוי כרגע.\nנא לשלוח "הפעל" או /on להפעלה.');
      }
      return res.status(200).json({ status: 'motti_off' });
    }

    // ── קבלת סשן (תמיד נטען כדי לא להפסיד הקשר) ──
    const session = await fbGet(`sessions/${chatId}`);

    // ── תמונה ──
    if (photo && photo.length > 0) {
      if (!session?.active) {
        await sendTelegram(chatId, '📸 התקבלה תמונה, אבל אין נכס פתוח.\nנא לשלוח "דירה מוכר" או "דירה מתווך" תחילה.');
        return res.status(200).json({ status: 'ok' });
      }

      await sendTelegram(chatId, '⏳ מעלים תמונה...');
      const fileId  = photo[photo.length - 1].file_id;
      const fileInfo= await (await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`)).json();
      const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${fileInfo.result.file_path}`;
      const url     = await uploadCloudinary(fileUrl);
      if (!url) {
        await sendTelegram(chatId, '❌ שגיאה בהעלאת התמונה. נא לנסות שוב.');
        return res.status(200).json({ status: 'ok' });
      }

      const photos = session.photos || [];
      photos.push(url);
      session.photos = photos;

      // אם caption מכיל פרטים, לשמור
      if (caption) {
        session.rawText = session.rawText ? session.rawText + '\n' + caption : caption;
      }

      await fbSet(`sessions/${chatId}`, session);
      await sendTelegram(chatId, `✅ תמונה #${photos.length} הועלתה!\n\n📸 ניתן לשלוח עוד תמונות.\n✅ בסיום — נא לשלוח "סיום"`);
      return res.status(200).json({ status: 'ok' });
    }

    // ── פקודות ──
    if (intent) {
      const { cmd, type, args } = intent;

      // ביטול — בכל מצב
      if (cmd === 'ביטול') {
        await fbDelete(`sessions/${chatId}`);
        await sendTelegram(chatId, '❌ הפעולה בוטלה.');
        return res.status(200).json({ status: 'ok' });
      }

      switch(cmd) {
        case 'start':
          await sendTelegram(chatId, [
            '🏠 *ברוכים הבאים ל-NadlanPro!*', '',
            'אני מוטי, הבוט לניהול נדל"ן 🤖', '',
            '📌 "דירה מוכר" — הוספת נכס מוכר',
            '📌 "דירה מתווך" — הוספת נכס מתווך',
            '📊 "סטטוס" — סטטוס המערכת',
            '🔛 "הפעל" | 😴 "כבה"',
            '❓ "עזרה"', '',
            'ניתן לשלוח גם עם / לפני הפקודה.',
            'יאללה, מתחילים! 💪',
          ].join('\n'));
          break;

        case 'on':
          await fbSet('settings/mottiActive', true);
          await sendTelegram(chatId, '🟢 מוטי פעיל!');
          break;

        case 'off':
          await fbSet('settings/mottiActive', false);
          await sendTelegram(chatId, '🔴 מוטי כבוי.\nנא לשלוח "הפעל" או /on להפעלה.');
          break;

        case 'סטטוס': {
          const active = await fbGet('settings/mottiActive');
          const [sellers, agents] = await Promise.all([
            fbGet('apartments/seller'), fbGet('apartments/agent'),
          ]);
          const sc = sellers ? Object.keys(sellers).length : 0;
          const ac = agents  ? Object.keys(agents).length  : 0;
          await sendTelegram(chatId, [
            '📊 *סטטוס NadlanPro*', '',
            `🤖 מוטי: ${active !== false ? '🟢 פעיל' : '🔴 כבוי'}`,
            `⏰ שליחה החוצה: ${canSendExternal() ? '✅ מותר' : '🚫 מחוץ לשעות'}`,
            `🏠 נכסי מוכר: ${sc}`,
            `🤝 נכסי מתווך: ${ac}`,
            `📦 סה"כ: ${sc + ac}`, '',
            `🕐 ${new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })}`,
          ].join('\n'));
          break;
        }

        case 'עזרה':
          await sendTelegram(chatId, [
            '❓ *עזרה — מוטי NadlanPro*', '',
            '📌 "דירה מוכר" — הוספת נכס מוכר',
            '📌 "דירה מתווך" — הוספת נכס מתווך',
            '📊 "סטטוס" / "מצב"',
            '🔛 "הפעל" / "הדלק"',
            '😴 "כבה" / "כיבוי"',
            '❌ "ביטול" / "בטל"', '',
            '💡 *איך להוסיף דירה:*',
            '1. שלח "דירה מוכר"',
            '2. שלח טקסט חופשי עם הפרטים + תמונות',
            '3. שלח "סיום"',
            '4. מוטי מכין פרסום ושולח לאישור',
          ].join('\n'));
          break;

        case 'דירה': {
          const label = type === 'seller' ? 'מוכר' : 'מתווך';
          const newSession = {
            active: true,
            type,
            step: 'collecting',
            rawText: args || '',
            photos: [],
            apartment: null,
            promoText: null,
            created_at: new Date().toISOString(),
          };
          await fbSet(`sessions/${chatId}`, newSession);

          if (args && args.length > 5) {
            await sendTelegram(chatId,
              `📋 קיבלתי! נכס *${label}*.\n\n` +
              `📸 ניתן לשלוח תמונות של הנכס.\n` +
              `✅ בסיום — שלח "סיום"`
            );
          } else {
            await sendTelegram(chatId,
              `📋 נא לשלוח את פרטי הנכס — כתובת, חדרים, קומה, גודל, מחיר ופרטי קשר.\n` +
              `מוטי ידאג לשאר 🤖\n\n` +
              `📸 ניתן לצרף גם תמונות.\n` +
              `✅ בסיום — שלח "סיום"`
            );
          }
          break;
        }

        default:
          await sendTelegram(chatId, '🤷 לא הבנתי.\nנא לשלוח "עזרה" לרשימת פקודות.');
      }
      return res.status(200).json({ status: 'ok' });
    }

    // ── סשן פעיל ──
    if (session?.active) {
      const lower = text.toLowerCase().trim();

      // ביטול
      if (['ביטול','בטל','עזוב'].includes(lower)) {
        await fbDelete(`sessions/${chatId}`);
        await sendTelegram(chatId, '❌ בוטל.');
        return res.status(200).json({ status: 'ok' });
      }

      // ════ שלב: איסוף ════
      if (session.step === 'collecting') {
        if (['סיום','done','שמור','save','סיים'].includes(lower)) {
          if (!session.rawText || session.rawText.trim().length < 5) {
            await sendTelegram(chatId,
              '⚠️ לא התקבלו פרטים על הנכס.\n' +
              'נא לשלוח טקסט עם פרטי הנכס (כתובת, חדרים, מחיר...) לפני סיום.'
            );
            return res.status(200).json({ status: 'ok' });
          }

          await sendTelegram(chatId, '🧠 מוטי מנתח את הפרטים...');
          const parsed = await parseWithClaude(session.rawText);
          if (!parsed) {
            await sendTelegram(chatId, '❌ לא הצלחתי לנתח את הפרטים. נא לנסות שוב.');
            return res.status(200).json({ status: 'ok' });
          }

          session.apartment = parsed;

          // בדיקת שדות קריטיים חסרים
          const missing = getMissingCritical(parsed);
          if (missing.length > 0) {
            session.step = 'ask_missing';
            session.missingQueue = missing.map(f => f.key);
            session.currentMissing = missing[0].key;
            await fbSet(`sessions/${chatId}`, session);
            await sendTelegram(chatId, `📍 חסר מידע:\n\n${missing[0].q}`);
            return res.status(200).json({ status: 'ok' });
          }

          // אם אין תמונות — לשאול
          if (!session.photos || session.photos.length === 0) {
            session.step = 'ask_photos';
            await fbSet(`sessions/${chatId}`, session);
            await sendTelegram(chatId,
              '📸 רוצים לצרף תמונות?\n' +
              'ניתן לשלוח תמונות עכשיו, או לכתוב "סיום" בלי תמונות.'
            );
            return res.status(200).json({ status: 'ok' });
          }

          // הכל מוכן — יצירת פרסום
          return await createAndSendPromo(chatId, session);
        }

        // טקסט חופשי — לצבור
        session.rawText = session.rawText
          ? session.rawText + '\n' + text
          : text;
        await fbSet(`sessions/${chatId}`, session);
        await sendTelegram(chatId,
          '✅ קיבלתי!\n\n📸 ניתן לשלוח תמונות.\n✅ בסיום — שלח "סיום"'
        );
        return res.status(200).json({ status: 'ok' });
      }

      // ════ שלב: שאלת שדות חסרים ════
      if (session.step === 'ask_missing') {
        const fieldKey = session.currentMissing;
        // שמור את התשובה
        if (fieldKey === 'rooms' || fieldKey === 'price') {
          const n = parseFloat(text.replace(/[^\d.]/g, ''));
          session.apartment[fieldKey] = isNaN(n) ? text : n;
        } else {
          session.apartment[fieldKey] = text;
        }

        // הסר מהתור
        session.missingQueue = (session.missingQueue || []).filter(k => k !== fieldKey);

        if (session.missingQueue.length > 0) {
          // עוד שדות חסרים
          session.currentMissing = session.missingQueue[0];
          const nextField = CRITICAL_FIELDS.find(f => f.key === session.currentMissing);
          await fbSet(`sessions/${chatId}`, session);
          await sendTelegram(chatId, nextField.q);
          return res.status(200).json({ status: 'ok' });
        }

        // אין יותר שדות חסרים — שואלים תמונות
        session.step = 'ask_photos';
        session.currentMissing = null;
        session.missingQueue = [];
        await fbSet(`sessions/${chatId}`, session);

        if (!session.photos || session.photos.length === 0) {
          await sendTelegram(chatId,
            '📸 רוצים לצרף תמונות?\n' +
            'ניתן לשלוח תמונות עכשיו, או לכתוב "סיום" בלי תמונות.'
          );
        } else {
          return await createAndSendPromo(chatId, session);
        }
        return res.status(200).json({ status: 'ok' });
      }

      // ════ שלב: שאלת תמונות ════
      if (session.step === 'ask_photos') {
        if (['סיום','done','לא','skip','בלי','ללא'].includes(lower)) {
          return await createAndSendPromo(chatId, session);
        }
        await sendTelegram(chatId,
          '📸 ניתן לשלוח תמונות, או "סיום" להמשיך בלי תמונות.'
        );
        return res.status(200).json({ status: 'ok' });
      }

      // ════ שלב: אישור פרסום ════
      if (session.step === 'confirm_promo') {
        if (['אישור','כן','ok','yes','אשר','אשרי'].includes(lower)) {
          // שמור promotions
          await fbPush('promotions', {
            apartment_id: session.apartment_id || null,
            type:         session.type,
            text:         session.promoText,
            photos:       session.photos || [],
            status:       'approved',
            created_at:   session.created_at,
            approved_at:  new Date().toISOString(),
          });
          await fbDelete(`sessions/${chatId}`);
          await sendTelegram(chatId,
            '✅ *הפרסום אושר ונשמר!*\n\n' +
            '📌 הפרסום מוכן לשליחה.\n' +
            'אף הודעה לא תישלח ללקוחות בלי אישור נוסף.'
          );
          return res.status(200).json({ status: 'ok' });
        }

        // תיקון
        await sendTelegram(chatId, '🧠 מתקן את הפרסום...');
        const fixed = await fixPromoWithClaude(session.promoText, text);
        if (!fixed) {
          await sendTelegram(chatId, '❌ שגיאה בתיקון. נא לנסות שוב.');
          return res.status(200).json({ status: 'ok' });
        }
        session.promoText = fixed;
        await fbSet(`sessions/${chatId}`, session);
        await sendTelegram(chatId,
          `📝 הפרסום המתוקן:\n\n${fixed}\n\n` +
          `━━━━━━━━━━━━━━━━\n` +
          `✅ "אישור" / "כן" לשמירה\n` +
          `✏️ לתיקון נוסף — שלח את השינוי`
        );
        return res.status(200).json({ status: 'ok' });
      }

      // שלב לא מוכר — חזרה לאיסוף
      session.step = 'collecting';
      await fbSet(`sessions/${chatId}`, session);
      await sendTelegram(chatId, '📋 נא לשלוח פרטים ותמונות.\n✅ בסיום — "סיום"');
      return res.status(200).json({ status: 'ok' });
    }

    // ── הודעה חופשית, אין סשן ──
    await sendTelegram(chatId,
      '🤖 מוטי כאן!\n\nנא לשלוח "עזרה" לרשימת פקודות.'
    );
    return res.status(200).json({ status: 'ok' });

  } catch(err) {
    console.error('Handler error:', err);
    return res.status(200).json({ error: err.message });
  }
}

// ═══ פונקציית עזר: יצירת פרסום ושליחה לאישור ═══
async function createAndSendPromo(chatId, session) {
  await sendTelegram(chatId, '🧠 מוטי מכין טקסט פרסום...');

  // שמור נכס ב-Firebase
  const apartment = {
    ...session.apartment,
    source:     session.type,
    photos:     session.photos || [],
    created_at: session.created_at,
  };
  let aptId = null;
  try {
    const aptResult = await fbPush(`apartments/${session.type}`, apartment);
    aptId = aptResult.name;
  } catch(e) {
    console.error('fbPush apartment error:', e);
  }

  // יצירת פרסום
  const promoText = await generatePromoWithClaude(apartment);
  if (!promoText) {
    await sendTelegram(chatId, '❌ שגיאה ביצירת הפרסום. נא לנסות שוב.');
    return { status: 200, body: { status: 'promo_error' } };
  }

  session.step         = 'confirm_promo';
  session.apartment    = apartment;
  session.apartment_id = aptId;
  session.promoText    = promoText;
  await fbSet(`sessions/${chatId}`, session);

  await sendTelegram(chatId,
    `✅ הנכס נשמר!\n\n📝 *הנה הפרסום המוכן:*\n\n${promoText}\n\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `✅ לאישור — שלח "אישור" או "כן"\n` +
    `✏️ לתיקון — שלח את השינוי (למשל: "תחליף מחיר ל-1,500,000")`
  );

  // This function is called inside the main handler which returns after it
  return { status: 'ok' };
}
