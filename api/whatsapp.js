const TELEGRAM_CHAT_ID = "5941736529";
const ULTRAMSG_INSTANCE = "instance169955";
const ULTRAMSG_TOKEN = "slhhpfslyuey11fp";

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({ status: 'ok', message: 'Motti Telegram bot webhook is alive' });
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
    const text = msg.text || '';

    if (chatId !== TELEGRAM_CHAT_ID) {
      console.log('BLOCKED: unauthorized chat', chatId);
      return res.status(200).json({ status: 'unauthorized' });
    }

    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    if (!BOT_TOKEN) {
      console.error('Missing TELEGRAM_BOT_TOKEN env var');
      return res.status(200).json({ status: 'error', message: 'missing token' });
    }

    async function sendTelegram(text) {
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text: text,
          parse_mode: 'HTML'
        })
      });
    }

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
