// Shared raw-DB-value → human label formatter (SYS-05 root fix).
//
// Several enum/status/terms columns are stored as snake_case DB tokens (e.g. "net_30",
// "in_progress") and must NEVER be shown to a user verbatim — every US-facing TMS/ERP/accounting
// system (QuickBooks, McLeod, Alvys, NetSuite) renders a human label ("Net 30", "In Progress").
// This is the ONE place that conversion happens so it can't drift per-screen.
//
// This is a best-effort generic formatter (underscore/hyphen → space, Title Case each word). It is
// NOT a substitute for a real label map when a value needs a specific, curated label (e.g. a status
// with a distinct capitalization like "HOS" or "COD") — reach for a dedicated Record<string, string>
// map in that case and only fall back to titleize() for the default/unknown case.
export function titleize(value: string | null | undefined): string {
  if (value === null || value === undefined) return "";
  const trimmed = String(value).trim();
  if (!trimmed) return "";
  return trimmed
    .split(/[_\-\s]+/)
    .filter(Boolean)
    .map((word) => (word.length ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(" ");
}
