import { describe, expect, it } from "vitest";
import type { TxHealthRow } from "../../api/transaction-health";
import { formatGlLedgerPre } from "./txHealthLedgerText";

// LEAD 443.308 D062 — the Transaction Health DR/CR preview prints QBO money ("$1,234.56"), never a bare 1234.56.
describe("formatGlLedgerPre", () => {
  const row = {
    doc_type: "bill_payment",
    display_label: "Payment · HUGO GAYTAN · 10/16/2026 · $1,234.50",
    checks: { posted: true, balanced: true, linked: true, sample_consistent: true },
    gl: {
      lines: [
        { account_code: "2000", account_name: "Accounts payable", dr: 123450, cr: 0 },
        { account_code: "1000", account_name: "Operating bank", dr: 0, cr: 123450 },
      ],
      dr_total: 123450,
      cr_total: 123450,
      balanced: true,
    },
  } as unknown as TxHealthRow;

  it("prints dollar signs and thousands separators on every amount", () => {
    const text = formatGlLedgerPre(row);
    expect(text).toContain("$1,234.50");
    expect(text).not.toMatch(/(^|\s)1234\.50\b/m);
    expect(text.match(/\$1,234\.50/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it("hides account numbers by default and shows them only when the setting is on (owner ruling 09-22)", () => {
    expect(formatGlLedgerPre(row)).not.toContain("2000 ");
    expect(formatGlLedgerPre(row)).not.toMatch(/^Acct/m);
    expect(formatGlLedgerPre(row, { showAccountNumbers: true })).toMatch(/^Acct/m);
    expect(formatGlLedgerPre(row, { showAccountNumbers: true })).toContain("2000 ");
  });

  it("keeps DR and CR columns aligned (every money line the same width)", () => {
    // body + totals rows only (the first line is the title, which carries the document label).
    const lines = formatGlLedgerPre(row).split("\n").slice(1).filter((l) => l.includes("$"));
    const widths = new Set(lines.map((l) => l.replace(/\s+✓ balanced$/, "").length));
    expect(widths.size).toBe(1);
  });
});
