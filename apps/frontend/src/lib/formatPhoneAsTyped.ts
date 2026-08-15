/**
 * formatPhoneAsTyped — progressive US/MX-style phone formatting as the user types, mirroring the
 * existing DISPLAY-only mask already used for driver.phone (`DriverDetail.tsx`'s `maskedPhone`,
 * `/^(\+?\d{0,2})?(\d{3})(\d{3})(\d{4})$/` -> "$2-$3-$4"). That regex only ever matched a value that
 * was ALREADY fully formatted correctly on save — free-typed input ("5125551234") never separates
 * because nothing formats it live. This is that missing live formatter, applied on every keystroke.
 *
 * Digits-only storage in, dashed display out — never blocks typing (backspace/paste both just
 * re-derive from the digit stream), caps at 10 significant digits (+ an optional leading 1-2 digit
 * country code carried through untouched, same shape the display mask already assumes).
 */
export function formatPhoneAsTyped(raw: string): string {
  const digitsOnly = raw.replace(/\D/g, "");
  if (!digitsOnly) return "";

  // Carry an optional 1-2 digit country/leading code (e.g. "1" for US, "52" for MX) ahead of the
  // 10-digit local number, same as the existing display-mask regex tolerates.
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

  let formatted = area;
  if (prefix) formatted += `-${prefix}`;
  if (line) formatted += `-${line}`;

  return country ? `+${country} ${formatted}` : formatted;
}
