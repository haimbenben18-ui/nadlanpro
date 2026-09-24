// ═══════════════════════════════════════════════════════════════════════
// Shared Firebase Realtime Database REST helpers — used for the Telegram
// bot's session state (sessions/<chatId>) and misc settings. Separate from
// _lib/firestore.js, which talks to the CRM's actual Firestore data.
// ═══════════════════════════════════════════════════════════════════════

const FIREBASE_URL = process.env.FIREBASE_URL;

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

export { fbGet, fbSet, fbPush, fbDelete };
