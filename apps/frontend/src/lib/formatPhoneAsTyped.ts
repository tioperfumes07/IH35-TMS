/**
 * formatPhoneAsTyped — progressive US/MX-style phone formatting as the user types.
 *
 * C-12 / D13 owner format: `(956) 000-0000` on display AND on entry (CreateDriverModal
 * placeholder already shows this shape). Digits-only stream in → parenthesized display out.
 * Never blocks typing; caps at 10 significant digits (+ optional 1–2 digit country code).
 */
export function formatPhoneAsTyped(raw: string): string {
  const digitsOnly = raw.replace(/\D/g, "");
  if (!digitsOnly) return "";

  let country = "";
  let local = digitsOnly;
  if (digitsOnly.length > 10) {
    const overflow = digitsOnly.length - 10;
    country = digitsOnly.slice(0, Math.min(overflow, 2));
    local = digitsOnly.slice(country.length, country.length + 10);
  } else {
    local = digitsOnly.slice(0, 10);
  }

  const area = local.slice(0, 3);
  const prefix = local.slice(3, 6);
  const line = local.slice(6, 10);

  let formatted = "";
  if (local.length <= 3) {
    formatted = `(${area}`;
  } else if (local.length <= 6) {
    formatted = `(${area}) ${prefix}`;
  } else {
    formatted = `(${area}) ${prefix}-${line}`;
  }

  return country ? `+${country} ${formatted}` : formatted;
}

/** Display-only alias — same C-12 mask for read surfaces. */
export function formatPhoneDisplay(raw: string | null | undefined): string {
  if (raw == null || String(raw).trim() === "") return "—";
  return formatPhoneAsTyped(String(raw)) || "—";
}
