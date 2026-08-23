// LEGAL-F5988 — legal contract signer-phone hydration must not hand the backend's strict
// E.164 validator (`/^\+\d{10,15}$/`, apps/backend/src/legal/contracts.service.ts) a raw
// picker phone in whatever shape it happens to be stored (mdata.drivers/customers/vendors do
// NOT uniformly enforce E.164 — e.g. bulk driver CSV import writes bare digits, see
// apps/backend/src/mdata/drivers-import.routes.ts normalizePhone()). An un-normalized value
// fails "Create & send" with a raw regex-pattern validation toast that names no field and gives
// the operator nothing to act on, since they never typed the value themselves — it was
// auto-filled from the picked driver/customer/vendor record.

/**
 * Best-effort normalize a phone number pulled from a picked entity into the backend's required
 * E.164 shape (+ and 10-15 digits). Already-valid E.164 values pass through unchanged. A bare
 * 10-digit US/Canada number is prefixed +1 (matches the default country code in
 * components/drivers/CreateDriverModal.tsx); an 11-digit number already carrying a leading "1"
 * is treated the same way. Anything else can't be confidently normalized — return "" rather than
 * hand the form a value guaranteed to fail validation, so the field lands empty (contract still
 * saves as a draft) instead of silently blocking the whole create/send on a value the operator
 * never entered and can't see is wrong.
 */
export function normalizePickedEntityPhoneToE164(raw: string | null | undefined): string {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return "";
  if (/^\+\d{10,15}$/.test(trimmed)) return trimmed;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return "";
}
