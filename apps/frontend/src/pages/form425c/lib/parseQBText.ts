import { INCOME_TYPES, XFER_KW } from "./constants";
import type { BankAccount, QBParsedLine } from "../types";

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

