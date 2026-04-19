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

// ═══ Claude API — פירסור פרטי נכס ═══
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

// ═══ Claude API — יצירת טקסט פרסום ═══
async function generatePromoWithClaude(apt) {
  try {
    const price = typeof apt.price === 'number' ? apt.price.toLocaleString('he-IL') : apt.price || '';
    const details = [
      apt.city ? `עיר: ${apt.city}` : '',
      apt.street ? `רחוב: ${apt.street}` : '',
      apt.rooms ? `חדרים: ${apt.rooms}` : '',
      apt.floor != null ? `קומה: ${apt.floor}` : '',
      apt.size_sqm ? `גודל: ${apt.size_sqm} מ"ר` : '',
      price ? `מחיר: ${price} ₪` : '',
      apt.contact_phone ? `טלפון: ${apt.contact_phone}` : '',
      apt.notes ? `הערות: ${apt.notes}` : '',
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
          `צור טקסט פרסום קצר לווטסאפ עבור נכס למכירה. החזר רק את הטקסט, בלי הסברים.\nהשתמש באימוג'ים. שפה יוניסקס (בלי פנייה מגדרית). בדיוק בפורמט הזה:\n\n🏠 דירה למכירה!\n📍 [עיר], [רחוב]\n🛏️ [חדרים] חדרים | 🏢 קומה [X]\n📐 [גודל] מ"ר\n💰 [מחיר] ₪\n📝 [הערות - רק אם יש]\n📞 לפרטים: [טלפון]\n\nRE/MAX באר שבע — חיים בן סימון\n\nהשמט שורות של שדות חסרים. פרטי הנכס:\n${details}` }],
      }),
    });
    const d = await r.json();
    return (d.content?.[0]?.text || '').trim();
  } catch(e) { return null; }
}

// ═══ Claude API — תיקון פרסום ═══
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
          `הנה טקסט פרסום נדל"ן:\n\n${currentPromo}\n\nנא לתקן לפי הבקשה הבאה: "${fixRequest}"\n\nהחזר רק את הטקסט המתוקן, בלי הסברים. שמור על אותו פורמט ואימוג'ים. שפה יוניסקס.` }],
      }),
    });
    const d = await r.json();
    return (d.content?.[0]?.text || '').trim();
  } catch(e) { return null; }
}

// ═══ זיהוי פקודות בעברית טבעית ═══
function detectCommand(text) {
  const t = text.trim();

  // דירה מוכר
  if (/^(תוסיף|הוסף|תכניס|הכנס)?\s*דירה\s+מוכר/i.test(t) || t === '/דירה_מוכר') return 'דירה_מוכר';
  // דירה מתווך
  if (/^(תוסיף|הוסף|תכניס|הכנס)?\s*דירה\s+מתווך/i.test(t) || t === '/דירה_מתווך') return 'דירה_מתווך';
  // כיבוי
  if (/^(כבה|כיבוי|תכבה)$/i.test(t) || t === '/off') return 'off';
  // הפעלה
  if (/^(הדלק|תדליק|הפעל)$/i.test(t) || t === '/on') return 'on';
  // סטטוס
  if (/^(סטטוס|מצב)$/i.test(t) || t === '/status' || t === '/סטטוס') return 'סטטוס';
  // עזרה
  if (/^(עזרה|עזור)$/i.test(t) || t === '/עזרה' || t === '/help') return 'עזרה';
  // ביטול
  if (/^(ביטול|בטל)$/i.test(t) || t === '/ביטול') return 'ביטול';
  // start
  if (t === '/start') return 'start';

  return null;
}

// ═══ חילוץ טקסט אחרי פקודת דירה ═══
function extractArgsAfterCommand(text) {
  // הסר את חלק הפקודה ותחזיר את השאר
  return text.replace(/^(תוסיף|הוסף|תכניס|הכנס)?\s*דירה\s+(מוכר|מתווך)\s*/i, '').trim()
    || text.replace(/^\/(דירה_מוכר|דירה_מתווך)\s*/i, '').trim();
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
    const caption = (msg.caption || '').trim();
    const photo = msg.photo;

    if (chatId !== TELEGRAM_CHAT_ID) return res.status(200).json({ status: 'unauthorized' });

    // בדיקה אם מוטי פעיל
    const mottiActive = await fbGet('settings/mottiActive');
    const cmd = detectCommand(text);

    if (mottiActive === false && cmd !== 'on') {
      if (cmd === 'סטטוס') {
        await sendTelegram(chatId, '😴 מוטי כבוי כרגע.\nנא לשלוח /on או "הפעל" להפעלה.');
      }
      return res.status(200).json({ status: 'motti_off' });
    }

    // ── תמונה ──
    if (photo && photo.length > 0) {
      const session = await fbGet(`sessions/${chatId}`);
      if (!session?.active) {
        await sendTelegram(chatId, '📸 התקבלה תמונה, אבל אין נכס פתוח.\nנא לשלוח "דירה מוכר" או "דירה מתווך" קודם.');
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

      const photos = session.photos || [];
      photos.push(url);
      session.photos = photos;
      await fbSet(`sessions/${chatId}`, session);

      // אם יש caption עם פרטים, לשמור אותו גם
      if (caption && !session.rawText) {
        session.rawText = caption;
        await fbSet(`sessions/${chatId}`, session);
      }

      await sendTelegram(chatId, `✅ תמונה #${photos.length} הועלתה!\n\n📸 ניתן לשלוח עוד תמונות או טקסט עם פרטי הנכס.\n✅ בסיום — נא לשלוח "סיום"`);
      return res.status(200).json({ status: 'ok' });
    }

    // ── פקודות (/ או עברית טבעית) ──
    if (cmd) {
      switch(cmd) {
        case 'start':
          await sendTelegram(chatId, [
            '🏠 ברוכים הבאים ל-NadlanPro!', '',
            'אני מוטי, הבוט החכם לניהול נדל"ן 🤖', '',
            '📌 "דירה מוכר" — הוספת נכס מוכר',
            '📌 "דירה מתווך" — הוספת נכס מתווך',
            '📊 "סטטוס" — סטטוס המערכת',
            '🔛 "הפעל" / 😴 "כבה"',
            '❓ "עזרה"', '',
            'אפשר גם עם / לפני הפקודה.', '',
            'יאללה, מתחילים! 💪',
          ].join('\n'));
          break;

        case 'on':
          await fbSet('settings/mottiActive', true);
          await sendTelegram(chatId, '🟢 מוטי פעיל!');
          break;

        case 'off':
          await fbSet('settings/mottiActive', false);
          await sendTelegram(chatId, '🔴 מוטי כבוי. נא לשלוח "הפעל" או /on להפעלה.');
          break;

        case 'דירה_מוכר':
        case 'דירה_מתווך': {
          const type = cmd === 'דירה_מוכר' ? 'seller' : 'agent';
          const args = extractArgsAfterCommand(text);

          await fbSet(`sessions/${chatId}`, {
            active: true,
            type,
            step: 'collecting',
            rawText: args || '',
            photos: [],
            created_at: new Date().toISOString(),
          });

          if (args.length > 10) {
            // כבר יש טקסט עם הפקודה — לאסוף תמונות
            await sendTelegram(chatId, '📋 קיבלתי את הפרטים!\n\n📸 נא לשלוח תמונות של הנכס.\n✅ בסיום — נא לשלוח "סיום"');
          } else {
            await sendTelegram(chatId, '📋 שולחים פרטים ותמונות של הנכס, מוטי יטפל בשאר 🤖\n\n💬 ניתן לשלוח טקסט חופשי עם כל הפרטים + תמונות.\n✅ בסיום — נא לשלוח "סיום"');
          }
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
          await sendTelegram(chatId, '❌ הפעולה בוטלה.\nנא לשלוח "עזרה" לרשימת פקודות.');
          break;

        case 'עזרה':
          await sendTelegram(chatId, [
            '❓ עזרה — מוטי NadlanPro', '',
            '📌 "דירה מוכר" — הוספת נכס מוכר',
            '📌 "דירה מתווך" — הוספת נכס מתווך',
            '📊 "סטטוס" / "מצב" — סטטוס המערכת',
            '🔛 "הפעל" / "הדלק" — הפעלת מוטי',
            '😴 "כבה" / "כיבוי" — כיבוי מוטי',
            '❌ "ביטול" / "בטל" — ביטול פעולה', '',
            '💡 דוגמה:',
            'דירה מוכר 3 חדרים בבאר שבע רינגלבלום 5 קומה 3 85 מר 1,200,000', '',
            '📸 אפשר לשלוח תמונות + טקסט חופשי, מוטי מסדר הכל!',
          ].join('\n'));
          break;

        default:
          await sendTelegram(chatId, '🤷 לא הבנתי.\nנא לשלוח "עזרה" לרשימת פקודות.');
      }
      return res.status(200).json({ status: 'ok' });
    }

    // ── סשן פעיל ──
    const session = await fbGet(`sessions/${chatId}`);
    if (session?.active) {
      const lower = text.trim();

      // ביטול בכל שלב
      if (['ביטול','בטל'].includes(lower)) {
        await fbDelete(`sessions/${chatId}`);
        await sendTelegram(chatId, '❌ בוטל.');
        return res.status(200).json({ status: 'ok' });
      }

      // ── שלב: איסוף פרטים ותמונות ──
      if (session.step === 'collecting') {
        if (['סיום','done','שמור','save'].includes(lower)) {
          // סיום איסוף — שליחה ל-Claude לפירסור ויצירת פרסום
          if (!session.rawText) {
            await sendTelegram(chatId, '⚠️ לא התקבלו פרטים על הנכס.\nנא לשלוח טקסט עם פרטי הנכס לפני סיום.');
            return res.status(200).json({ status: 'ok' });
          }

          await sendTelegram(chatId, '🧠 מוטי מנתח את הפרטים ומכין פרסום...');

          // פירסור הפרטים
          const parsed = await parseWithClaude(session.rawText);
          if (!parsed) {
            await sendTelegram(chatId, '❌ לא הצלחתי לנתח את הפרטים. נא לנסות שוב.');
            return res.status(200).json({ status: 'ok' });
          }

          // יצירת טקסט פרסום
          const promoText = await generatePromoWithClaude(parsed);
          if (!promoText) {
            await sendTelegram(chatId, '❌ שגיאה ביצירת הפרסום. נא לנסות שוב.');
            return res.status(200).json({ status: 'ok' });
          }

          // שמירת הנכס ב-Firebase
          const apartment = {
            ...parsed,
            source: session.type,
            photos: session.photos || [],
            created_at: session.created_at,
          };
          const aptResult = await fbPush(`apartments/${session.type}`, apartment);
          const aptId = aptResult.name;

          // עדכון הסשן לשלב אישור פרסום
          session.step = 'confirm_promo';
          session.apartment = apartment;
          session.apartment_id = aptId;
          session.promoText = promoText;
          await fbSet(`sessions/${chatId}`, session);

          await sendTelegram(chatId, `✅ הנכס נשמר!\n\n📝 הנה הפרסום המוכן:\n\n${promoText}\n\n━━━━━━━━━━━━━━━━\n✅ לאישור — נא לשלוח "אישור" או "כן"\n✏️ לתיקון — נא לשלוח את התיקון (למשל: "תחליף מחיר ל-1,500,000")`);
          return res.status(200).json({ status: 'ok' });
        }

        // טקסט רגיל — לאסוף כפרטי נכס
        if (session.rawText) {
          session.rawText += '\n' + text;
        } else {
          session.rawText = text;
        }
        await fbSet(`sessions/${chatId}`, session);
        await sendTelegram(chatId, '✅ קיבלתי!\n\n📸 ניתן לשלוח עוד תמונות או פרטים.\n✅ בסיום — נא לשלוח "סיום"');
        return res.status(200).json({ status: 'ok' });
      }

      // ── שלב: אישור פרסום ──
      if (session.step === 'confirm_promo') {
        if (['אישור','כן','ok','yes','אשר'].includes(lower)) {
          // שמירת הפרסום ב-promotions
          await fbPush('promotions', {
            apartment_id: session.apartment_id,
            type: session.type,
            text: session.promoText,
            photos: session.photos || [],
            status: 'approved',
            created_at: session.created_at,
            approved_at: new Date().toISOString(),
          });

          await fbDelete(`sessions/${chatId}`);
          await sendTelegram(chatId, '✅ הפרסום אושר ונשמר!\n\n📌 הפרסום מוכן לשליחה. אף הודעה לא תישלח ללקוחות בלי אישור נוסף.');
          return res.status(200).json({ status: 'ok' });
        }

        // תיקון — שליחה ל-Claude לתיקון
        await sendTelegram(chatId, '🧠 מוטי מתקן את הפרסום...');
        const fixedPromo = await fixPromoWithClaude(session.promoText, text);
        if (!fixedPromo) {
          await sendTelegram(chatId, '❌ שגיאה בתיקון. נא לנסות שוב.');
          return res.status(200).json({ status: 'ok' });
        }

        session.promoText = fixedPromo;
        await fbSet(`sessions/${chatId}`, session);

        await sendTelegram(chatId, `📝 הנה הפרסום המתוקן:\n\n${fixedPromo}\n\n━━━━━━━━━━━━━━━━\n✅ לאישור — "אישור" או "כן"\n✏️ לתיקון נוסף — נא לשלוח את התיקון`);
        return res.status(200).json({ status: 'ok' });
      }

      // שלב לא מוכר — חזרה לאיסוף
      session.step = 'collecting';
      await fbSet(`sessions/${chatId}`, session);
      await sendTelegram(chatId, '📋 נא לשלוח פרטים ותמונות של הנכס.\n✅ בסיום — "סיום"');
      return res.status(200).json({ status: 'ok' });
    }

    // ── הודעה חופשית בלי סשן ──
    await sendTelegram(chatId, '🤖 מוטי כאן!\n\nנא לשלוח "עזרה" לרשימת פקודות.');
    return res.status(200).json({ status: 'ok' });

  } catch(err) {
    console.error('שגיאה:', err);
    return res.status(200).json({ error: err.message });
  }
}
