const ULTRAMSG_INSTANCE = "instance169955";
const ULTRAMSG_TOKEN = "slhhpfslyuey11fp";
const MOTTI_GROUP_ID = "120363409064480878@g.us";

async function sendWhatsApp(to, body) {
  if (to !== MOTTI_GROUP_ID) {
    console.log('BLOCKED: attempt to send to', to);
    return null;
  }
  
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
    const messageData = data.data || data;
    
    console.log('From:', messageData.from, 'FromMe:', messageData.fromMe, 'Body:', messageData.body);

    if (messageData.from !== MOTTI_GROUP_ID) {
      return res.status(200).json({ status: 'ignored', reason: 'not motti group' });
    }
    
    if (messageData.fromMe === true || messageData.fromMe === "true") {
      return res.status(200).json({ status: 'ignored', reason: 'own message' });
    }

    if (!messageData.body) {
      return res.status(200).json({ status: 'ignored', reason: 'no content' });
    }

    const messageBody = messageData.body;
    const reply = `🤖 מוטי כאן.\n\nקיבלתי: "${messageBody.substring(0, 100)}"\n\nאני בשלב פיתוח - לא מבצע פעולות עדיין.`;

    await sendWhatsApp(MOTTI_GROUP_ID, reply);

    return res.status(200).json({ 
      status: 'success', 
      replied: true
    });

  } catch (error) {
    console.error('Handler error:', error);
    return res.status(200).json({ 
      status: 'error', 
      message: error.message 
    });
  }
}
