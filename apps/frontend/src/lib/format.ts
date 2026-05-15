/** USD cents → formatted display (always USD per app convention). */
export function formatCurrencyCents(cents: number | null | undefined): string {
  if (cents == null || Number.isNaN(Number(cents))) return "—";
  const n = Number(cents) / 100;
  const sign = n < 0 ? "-" : "";
  const abs = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Math.abs(n));
  return `${sign}${abs}`;
}

/** ISO or date string → locale date; empty on null/invalid. */
export function formatDate(value: string | null | undefined): string {
  if (!value || !String(value).trim()) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
