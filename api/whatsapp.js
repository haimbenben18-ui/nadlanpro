const TELEGRAM_CHAT_ID = "5941736529";
const ULTRAMSG_INSTANCE = "instance169955";
const ULTRAMSG_TOKEN = "slhhpfslyuey11fp";

let mottiActive = true;

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({ status: 'ok', active: mottiActive });
  }
  if (req.method !== 'POST') {
    return res.status(200).json({ status: 'ignored' });
  }

  try {
    const update = req.body;
    if (!update.message) {
      return res.status(200).json({ status: 'no message' });
    }

    const msg = update.message;
    const chatId = String(msg.chat.id);
    const text = (msg.text || '').trim();

    if (chatId !== TELEGRAM_CHAT_ID) {
      return res.status(200).json({ status: 'unauthorized' });
    }

    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    if (!BOT_TOKEN) {
      return res.status(200).json({ status: 'error', message: 'missing token' });
    }

    async function sendTelegram(replyText) {
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text: replyText,
          parse_mode: 'HTML'
        })
      });
    }

    // פקודות הפעלה וכיבוי
    if (text === '/off' || text === 'כבה') {
      mottiActive = false;
      await sendTelegram('🔴 מוטי כבוי. לא אגיב להודעות עד שתכתוב /on');
      return res.status(200).json({ status: 'turned off' });
    }

    if (text === '/on' || text === 'הפעל') {
      mottiActive = true;
      await sendTelegram('🟢 מוטי פעיל! אני כאן.');
      return res.status(200).json({ status: 'turned on' });
    }

    if (text === '/status' || text === 'סטטוס') {
      await sendTelegram(mottiActive ? '🟢 מוטי פעיל.' : '🔴 מוטי כבוי.');
      return res.status(200).json({ status: 'status sent' });
    }

    // אם מוטי כבוי - לא עונה
    if (!mottiActive) {
      return res.status(200).json({ status: 'sleeping' });
    }

    // פקודות רגילות
    if (text === '/start') {
      await sendTelegram(
        '🤖 <b>שלום חיים, מוטי כאן!</b>\n\n' +
        'אני הסוכן האישי שלך ב-NadlanPro.\n\n' +
        '⏳ אני בשלב פיתוח. בקרוב אוכל:\n' +
        '📝 להוסיף דירות\n' +
        '📸 לקבל תמונות\n' +
        '🎯 ליצור פרסומים\n' +
        '📤 לשלוח לקונים (עם אישור שלך)\n' +
        '📘 לפרסם בפייסבוק (עם אישור שלך)\n\n' +
        'פקודות שימושיות:\n' +
        '/off - כבה את מוטי\n' +
        '/on - הפעל את מוטי\n' +
        '/status - בדוק אם מוטי פעיל\n\n' +
        'כל פעולה רגישה דורשת אישור שלך לפני ביצוע.\n\n' +
        '💬 כתוב לי מה אתה צריך!'
      );
    } else {
      await sendTelegram(
        '🤖 מוטי כאן.\n\n' +
        'קיבלתי: "<b>' + text.substring(0, 200) + '</b>"\n\n' +
        '⏳ אני בשלב פיתוח - עדיין לא מבצע פעולות.\n' +
        'בקרוב אוכל לעזור לך!'
      );
    }

    return res.status(200).json({ status: 'success' });

  } catch (error) {
    console.error('Handler error:', error);
    return res.status(200).json({ status: 'error', message: error.message });
  }
}
