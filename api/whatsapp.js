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
  if (req.method !== 'POST') {
    return res.status(200).json({ status: 'ok', message: 'NadlanPro WhatsApp webhook is alive' });
  }

  try {
    const data = req.body;
    console.log('Full webhook payload:', JSON.stringify(data));

    const messageData = data.data || data;

    console.log('From:', messageData.from);
    console.log('FromMe:', messageData.fromMe);
    console.log('Body:', messageData.body);
    console.log('Type:', messageData.type);

    if (messageData.fromMe === true || messageData.fromMe === "true") {
      console.log('Ignoring: own message');
      return res.status(200).json({ status: 'ignored', reason: 'own message' });
    }

    if (!messageData.body) {
      console.log('Ignoring: no body');
      return res.status(200).json({ status: 'ignored', reason: 'no content' });
    }

    // מוטי עונה לכל הודעה נכנסת (בינתיים)
    const from = messageData.from;
    const messageBody = messageData.body;

    const reply = `🤖 מוטי כאן!\n\nקיבלתי: "${messageBody.substring(0, 100)}"\n\n✅ המערכת חיה ומגיבה!\n\n⏳ בפיתוח - בקרוב אוכל לבצע פעולות.`;

    await sendWhatsApp(from, reply);

    return res.status(200).json({
      status: 'success',
      replied: true,
      to: from
    });

  } catch (error) {
    console.error('Handler error:', error);
    return res.status(200).json({
      status: 'error',
      message: error.message
    });
  }
}
