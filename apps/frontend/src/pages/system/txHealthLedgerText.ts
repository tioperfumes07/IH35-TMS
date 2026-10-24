import type { TxHealthRow } from "../../api/transaction-health";
import { formatUsdCents } from "../../lib/money";

/** System › Transaction Health — the fixed-width GL preview ("wiring preview") of one document. */
/** Owner ruling (09-22): account numbers are OFF by default; the Acct column prints only when showAccountNumbers is on. */
export function formatGlLedgerPre(row: TxHealthRow, opts: { showAccountNumbers?: boolean } = {}): string {
  const showAccountNumbers = opts.showAccountNumbers === true;
  const gl = row.gl;
  const head = `${row.doc_type.replace(/_/g, " ").toUpperCase()}  ${row.display_label}  ·  ${row.checks.posted ? "POSTED" : "UNPOSTED"}`;
  if (gl == null) return `${head}\n\nno GL entry — this document type posts nothing`;
  const col = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s.padEnd(n));
  // LEAD 443.308 D062 — QBO money in the DR/CR preview: "$1,234.56", never a bare 1234.56. Columns widened to 15 so
  // "$999,999.99" plus a sign still aligns.
  const money = (cents: number) => (cents === 0 ? "".padStart(15) : formatUsdCents(cents).padStart(15));
  const acctHead = showAccountNumbers ? `${col("Acct", 10)} ` : "";
  const header = `${acctHead}${col("Account", 28)} ${"DR".padStart(15)} ${"CR".padStart(15)}`;
  const body = gl.lines.map((line) => `${showAccountNumbers ? `${col(line.account_code || "", 10)} ` : ""}${col(line.account_name || "", 28)} ${money(line.dr)} ${money(line.cr)}`);
  const rule = "-".repeat((showAccountNumbers ? 11 : 0) + 28 + 1 + 15 + 1 + 15);
  const totals = `${showAccountNumbers ? `${col("", 10)} ` : ""}${col("", 28)} ${money(gl.dr_total)} ${money(gl.cr_total)}   ${gl.balanced ? "✓ balanced" : "UNBALANCED"}`;
  return [head, "", header, ...body, rule, totals].join("\n");
}
