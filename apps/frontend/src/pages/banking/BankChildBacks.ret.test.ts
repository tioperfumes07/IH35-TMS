import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(process.cwd(), "src/pages/banking");

const FILES = [
  "TransfersListPage.tsx",
  "ReconciliationWorkspace.tsx",
  "BankAccountDetail.tsx",
  "BankReconciliationPage.tsx",
  "BankTxCategorizationPage.tsx",
  "BankingObligationReconcilePage.tsx",
  "CategorizationRulesPage.tsx",
  "QboSyncQueuePage.tsx",
  "EmailQueuePage.tsx",
];

describe("ROUND 8.20 board3 Banking child Backs honor ?ret=", () => {
  for (const file of FILES) {
    it(`${file} uses resolveBackHref (no hard-coded /banking Back)`, () => {
      const source = readFileSync(join(root, file), "utf8");
      expect(source).toMatch(/resolveBackHref/);
      expect(source).toMatch(/bankingBackHref/);
      expect(source).not.toContain('backHref="/banking"');
    });
  }
});
