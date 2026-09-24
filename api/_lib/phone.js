// ═══════════════════════════════════════════════════════════════════════
// Shared phone-number normalization, so numbers coming from different
// sources (a phone-automation webhook, a UI text field, UltraMsg) can be
// compared reliably regardless of formatting (+972.., 972.., 0.., spaces,
// dashes).
// ═══════════════════════════════════════════════════════════════════════

// Normalizes to local Israeli form: "0" + 8-9 digits (e.g. "0501234567").
// Returns "" for anything that doesn't look like a phone number at all.
function normalizePhone(p) {
  let d = String(p || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("972")) d = "0" + d.slice(3);
  else if (!d.startsWith("0")) d = "0" + d;
  return d;
}

// True if two phone strings refer to the same number once normalized.
function samePhone(a, b) {
  const na = normalizePhone(a), nb = normalizePhone(b);
  return !!na && na === nb;
}

export { normalizePhone, samePhone };
