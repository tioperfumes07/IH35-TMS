import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const files = [
  "./SubmissionQueue.tsx",
  "./FaroImportPage.tsx",
  "./FaroDebtorRecordPage.tsx",
  "./Faro1090WireProposalsPage.tsx",
  "./FactorAdmin.tsx",
  "./BatchWizard.tsx",
] as const;

describe("ROUND 8.20 board18 — Factoring child Backs honor ?ret=", () => {
  for (const rel of files) {
    it(`${rel} resolves Back from ret (no hard-coded /factoring)`, () => {
      const source = readFileSync(resolve(__dirname, rel), "utf8");
      expect(source).toMatch(/resolveBackHref/);
      expect(source).toMatch(/factoringBackHref/);
      expect(source).not.toMatch(/backHref="\/factoring"/);
    });
  }
});
