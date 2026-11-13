import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(process.cwd(), "src/pages/accounting");

const FILES: Array<{ file: string; literal: string }> = [
  { file: "BillDetailPage.tsx", literal: 'backHref="/accounting/bills"' },
  { file: "ExpenseDetailPage.tsx", literal: 'backHref="/accounting/expenses/list"' },
  { file: "PaymentDetailPage.tsx", literal: 'backHref="/accounting/payments"' },
  { file: "BillPaymentDetailPage.tsx", literal: 'backHref="/accounting/bill-payments"' },
  { file: "journal-entries/JournalEntryDetailPage.tsx", literal: 'backHref="/accounting/journal-entries"' },
  { file: "loans/LoansAdvancesPage.tsx", literal: 'backHref="/accounting"' },
];

describe("ROUND 8.20 board1 Accounting child Backs honor ?ret=", () => {
  for (const { file, literal } of FILES) {
    it(`${file} uses resolveBackHref (no hard-coded ${literal})`, () => {
      const source = readFileSync(join(root, file), "utf8");
      expect(source).toMatch(/resolveBackHref/);
      expect(source).toMatch(/accountingBackHref/);
      expect(source).not.toContain(literal);
    });
  }
});
