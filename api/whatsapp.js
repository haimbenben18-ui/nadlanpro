// api/whatsapp.js - Webhook receiver for UltraMsg
// שלב 0: קבלת הודעות בלבד, תגובה בסיסית

const ULTRAMSG_INSTANCE = "instance169955";
const ULTRAMSG_TOKEN = "slhhpfslyuey11fp";
const AGENT_GROUP_NAME = "🤖 מוטי - NadlanPro";

async function sendWhatsApp(to, body) {
  const url = `https://api.ultramsg.com/${ULTRAMSG_INSTANCE}/messages/chat`;
  const params = new URLSearchParams({
    token: ULTRAMSG_TOKEN,
    to: to,
    body: body
  });

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params
    });
    return await response.json();
  } catch (error) {
    console.error('Error sending WhatsApp:', error);
    return null;
  }
}

export default async function handler(req, res) {
  // רק POST requests
  if (req.method !== 'POST') {
    return res.status(200).json({ status: 'ok', message: 'NadlanPro WhatsApp webhook is alive' });
  }

  try {
    const data = req.body;
    console.log('Webhook received:', JSON.stringify(data));

    // UltraMsg שולח את ההודעה בתוך data או ישירות
    const messageData = data.data || data;

    // בדוק שזו הודעה נכנסת (לא שלנו)
    if (messageData.fromMe === true || messageData.fromMe === "true") {
      return res.status(200).json({ status: 'ignored', reason: 'own message' });
    }

    // בדוק שיש תוכן
    if (!messageData.body && messageData.type !== 'image' && messageData.type !== 'video') {
      return res.status(200).json({ status: 'ignored', reason: 'no content' });
    }

    // זיהוי הקבוצה - אם chatName מכיל "מוטי" או "NadlanPro"
    const chatName = messageData.chatName || messageData.pushname || '';
    const isAgentGroup = chatName.includes('מוטי') || chatName.includes('NadlanPro');

    if (!isAgentGroup) {
      return res.status(200).json({ status: 'ignored', reason: 'not agent group' });
    }

    // שולח תשובה בסיסית - מוטי חי!
    const from = messageData.from;
    const messageBody = messageData.body || '(מדיה)';

    const reply = `🤖 מוטי כאן!\n\nקיבלתי את ההודעה שלך:\n"${messageBody.substring(0, 100)}"\n\n⏳ אני בשלב פיתוח - עוד אין לי יכולות מלאות, אבל אני מחובר ומקשיב.\n\nבקרוב אוכל:\n📝 להוסיף דירות\n📸 לקבל תמונות\n🎯 ליצור פרסומים\n📤 לשלוח לקונים\n\nנתראה בקרוב! 👋`;

    await sendWhatsApp(from, reply);

    return res.status(200).json({
      status: 'success',
      replied: true,
      chatName: chatName
    });

  } catch (error) {
    console.error('Handler error:', error);
    return res.status(200).json({
      status: 'error',
      message: error.message
    });
  }
}
