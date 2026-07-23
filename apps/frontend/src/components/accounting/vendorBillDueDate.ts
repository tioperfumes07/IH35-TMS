/**
 * QBO-parity: Bill Date + Terms → Due Date (Net N = bill date + N calendar days).
 * Pure helper — no timezone shift: operate on YYYY-MM-DD as civil dates.
 */
export function netDaysFromTerms(terms: string): number {
  const key = terms.trim().toLowerCase();
  if (key === "net_7" || key === "net7") return 7;
  if (key === "net_15" || key === "net15") return 15;
  if (key === "net_30" || key === "net30") return 30;
  if (key === "due_on_receipt" || key === "due on receipt") return 0;
  const match = /^net[_\s-]?(\d+)$/i.exec(key);
  if (match) return Number(match[1]);
  return 30;
}

export function dueDateFromBillTerms(billDate: string, terms: string): string {
  const mt = /^(\d{4})-(\d{2})-(\d{2})$/.exec(billDate.trim());
  if (!mt) return "";
  const y = Number(mt[1]);
  const m = Number(mt[2]);
  const d = Number(mt[3]);
  if (!y || !m || !d) return "";
  const days = netDaysFromTerms(terms);
  // Civil-date arithmetic in UTC noon to avoid DST edge cases.
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}
