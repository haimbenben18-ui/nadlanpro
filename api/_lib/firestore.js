// ═══════════════════════════════════════════════════════════════════════
// Shared Firestore REST helpers (the web app itself talks to Firestore via
// the Firebase SDK; these serverless functions use the plain REST API so
// they don't need the SDK). Used by api/cron-agents.js and api/whatsapp.js.
// ═══════════════════════════════════════════════════════════════════════

const FIRESTORE_PROJECT = process.env.FIRESTORE_PROJECT || "nadlanpro-5b041";
const FIRESTORE_KEY     = process.env.FIRESTORE_API_KEY || "AIzaSyBAD_k4u-8hXNb4VMMiDOoPvJ17wVZW9ew";

function fsDecodeValue(v) {
  if (!v) return null;
  if (v.stringValue    !== undefined) return v.stringValue;
  if (v.integerValue   !== undefined) return parseInt(v.integerValue, 10);
  if (v.doubleValue    !== undefined) return v.doubleValue;
  if (v.booleanValue   !== undefined) return v.booleanValue;
  if (v.nullValue      !== undefined) return null;
  if (v.timestampValue !== undefined) return v.timestampValue;
  if (v.arrayValue)   return (v.arrayValue.values || []).map(fsDecodeValue);
  if (v.mapValue)     return fsDecodeFields(v.mapValue.fields || {});
  return null;
}
function fsDecodeFields(fields) {
  const o = {};
  for (const [k, v] of Object.entries(fields || {})) o[k] = fsDecodeValue(v);
  return o;
}
function fsEncodeValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number")  return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === "string")  return { stringValue: v };
  if (Array.isArray(v))       return { arrayValue: { values: v.map(fsEncodeValue) } };
  if (typeof v === "object")  return { mapValue: { fields: fsEncodeFields(v) } };
  return { stringValue: String(v) };
}
function fsEncodeFields(obj) {
  const f = {};
  for (const [k, v] of Object.entries(obj)) f[k] = fsEncodeValue(v);
  return f;
}

async function fsGetDoc(docPath) {
  const url = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT}/databases/(default)/documents/${docPath}?key=${FIRESTORE_KEY}`;
  const r = await fetch(url);
  if (!r.ok) return null;
  const j = await r.json();
  return j && j.fields ? fsDecodeFields(j.fields) : null;
}

async function fsSetDoc(docPath, obj) {
  const url = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT}/databases/(default)/documents/${docPath}?key=${FIRESTORE_KEY}`;
  const r = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields: fsEncodeFields(obj) }),
  });
  return r.ok;
}

export { fsGetDoc, fsSetDoc, fsEncodeValue, fsDecodeValue };
