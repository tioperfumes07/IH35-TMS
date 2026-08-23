import { INCOME_TYPES, XFER_KW } from "./constants";
import type { BankAccount, QBParsedLine } from "../types";

/** Month is 0-based (JS Date). Unknown date formats are out-of-period (fail closed). */
export function qbDateInPeriod(dateStr: string, month: number, year: number): boolean {
  const s = String(dateStr).trim();
  const iso = /^(\d{4})-(\d{2})/.exec(s);
  if (iso) return Number(iso[1]) === year && Number(iso[2]) === month + 1;
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (us) return Number(us[3]) === year && Number(us[1]) === month + 1;
  return false;
}

export function parseQBText(raw: string, bankAccounts: BankAccount[]): QBParsedLine[] {
  const results: QBParsedLine[] = [];
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  for (const line of lines) {
    const cols = line.split("\t");
    if (cols.length < 3) continue;
    const dateStr = (cols[0] || "").trim();
    if (!dateStr || dateStr.toLowerCase() === "date") continue;
    const typecol = (cols[1] || "").toLowerCase();
    const desccol = (cols[2] || "").toLowerCase();
    const acctcol = (cols[3] || cols[2] || "").toLowerCase();
    const rawAmt = (cols[cols.length - 1] || "").replace(/[$,\s()]/g, "");
    const amt = parseFloat(rawAmt);
    if (!amt || amt <= 0) continue;
    if (XFER_KW.some((kw) => typecol.includes(kw) || desccol.includes(kw) || acctcol.includes(kw))) continue;
    const matched = bankAccounts.find(
      (a) =>
        acctcol.includes(a.id.toLowerCase()) ||
        acctcol.includes((a.number || "").toLowerCase()) ||
        acctcol.includes(a.label.toLowerCase().split("–").pop()?.trim() ?? "")
    );
    if (!matched) continue;
    const isIncome = INCOME_TYPES.some((d) => typecol.includes(d) || desccol.includes(d));
    if (!isIncome) continue;
    results.push({
      date: cols[0] ?? "",
      type: cols[1] ?? "",
      desc: (cols[2] ?? "").substring(0, 55),
      acct: matched.label,
      amt,
      include: true,
    });
  }
  return results;
}

