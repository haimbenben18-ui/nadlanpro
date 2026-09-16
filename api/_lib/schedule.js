// ═══════════════════════════════════════════════════════════════════════
// Shared "is it OK to auto-send marketing WhatsApp messages right now?"
// gate for the agent-broadcast automation.
// Used by both api/cron-agents.js (the automatic sender) and api/whatsapp.js
// (the "סטטוס" command, and manual overrides).
//
// Rules (set by Haim, Sep 2026):
//   • Sending only happens 08:00–20:00 Israel time.
//   • Friday is blocked from 12:00 onward (rest of the day = ערב שבת).
//   • Saturday is blocked all day.
//   • Any Jewish holiday is blocked all day — including Yom Kippur — computed
//     LIVE via the Hebcal API so this never goes stale from one year to the
//     next (a hardcoded date list would need manual updates every year).
//
// A files/folder starting with "_" inside /api is NOT deployed as a route by
// Vercel, so this file is safe to import from other functions.
// ═══════════════════════════════════════════════════════════════════════

const ISRAEL_TZ = "Asia/Jerusalem";

function israelNow() {
  const s = new Date().toLocaleString("en-US", { timeZone: ISRAEL_TZ });
  return new Date(s);
}

function todayKey(now = israelNow()) {
  return now.toISOString().slice(0, 10);
}

// ── שעות עבודה: 08:00–20:00 ──
function isWithinWorkingHours(now = israelNow()) {
  const minutes = now.getHours() * 60 + now.getMinutes();
  return minutes >= 480 && minutes <= 1200; // 08:00 .. 20:00
}

// ── שישי מ-12:00 ושבת כל היום ──
function isShabbat(now = israelNow()) {
  const day = now.getDay(); // 0=Sun ... 5=Fri, 6=Sat
  if (day === 6) return true;
  if (day === 5 && (now.getHours() * 60 + now.getMinutes()) >= 720) return true; // שישי מ-12:00
  return false;
}

// ── חגים יהודיים — דרך Hebcal, לא רשימה קשיחה ──
// חוסם: חגים גדולים וקטנים (ר"ה, יו"כ, סוכות, חנוכה, פורים, פסח, שבועות...),
// ימי זיכרון/עצמאות מודרניים, ותשעה באב בלבד מבין הצומות הקטנים.
function isBlockedHolidayEvent(item) {
  if (item.category === "holiday") return true;
  if (item.category === "modern")  return true;
  if (item.category === "fast" && /Tish.?a?\s*B.?Av/i.test(item.title || "")) return true;
  return false;
}

let holidayCache = { year: null, month: null, dates: null, fetchedAt: 0 };
const HOLIDAY_CACHE_MS = 12 * 60 * 60 * 1000; // 12h

async function fetchHolidayDatesForMonth(year, month) {
  if (holidayCache.year === year && holidayCache.month === month &&
      (Date.now() - holidayCache.fetchedAt) < HOLIDAY_CACHE_MS) {
    return holidayCache.dates;
  }
  const url = `https://www.hebcal.com/hebcal?v=1&cfg=json&year=${year}&month=${month}&i=on&maj=on&min=on&mod=on&mf=on`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`hebcal http ${r.status}`);
  const j = await r.json();
  const dates = new Set((j.items || []).filter(isBlockedHolidayEvent).map(it => it.date));
  holidayCache = { year, month, dates, fetchedAt: Date.now() };
  return dates;
}

async function isJewishHoliday(now = israelNow()) {
  try {
    const dates = await fetchHolidayDatesForMonth(now.getFullYear(), now.getMonth() + 1);
    return dates.has(todayKey(now));
  } catch (e) {
    console.error("isJewishHoliday: hebcal fetch failed — blocking send as a precaution:", e.message);
    return true; // fail-safe: if we can't confirm it's a normal day, don't risk sending on a holiday
  }
}

// ── שער מאוחד ──
async function canSendNow(now = israelNow()) {
  if (!isWithinWorkingHours(now)) return { ok: false, reason: "outside_hours" };
  if (isShabbat(now))             return { ok: false, reason: "shabbat" };
  if (await isJewishHoliday(now)) return { ok: false, reason: "holiday" };
  return { ok: true, reason: null };
}

// ── באיזה חלון שליחה מוגדר אנחנו נמצאים עכשיו (אם בכלל) ──
// מחזיר את השעה שהוגדרה (למשל "14:30") אם עברו עד toleranceMin דקות ממנה,
// או null אם לא. בין כמה חלונות שחלפו — בוחר את הקרוב ביותר (העדכני).
const DEFAULT_SLOT_TOLERANCE_MIN = 20;

function pickDueSlot(sendTimes, now = israelNow(), toleranceMin = DEFAULT_SLOT_TOLERANCE_MIN) {
  const list = Array.isArray(sendTimes) && sendTimes.length ? sendTimes : ["08:30", "11:30", "14:30", "17:30"];
  const nowMin = now.getHours() * 60 + now.getMinutes();
  let best = null;
  for (const t of list) {
    const [h, m] = String(t).split(":").map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) continue;
    const tMin = h * 60 + m;
    if (nowMin >= tMin && nowMin - tMin <= toleranceMin) {
      if (!best || tMin > best.tMin) best = { t, tMin };
    }
  }
  return best ? best.t : null;
}

export {
  israelNow, todayKey, isWithinWorkingHours, isShabbat, isJewishHoliday, canSendNow,
  pickDueSlot, DEFAULT_SLOT_TOLERANCE_MIN,
};
