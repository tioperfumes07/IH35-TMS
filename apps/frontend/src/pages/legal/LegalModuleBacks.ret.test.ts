import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const files = [
  "./LegalPoliciesPage.tsx",
  "./LegalAttorneyReviewPage.tsx",
  "./reports/LegalReportsLandingPage.tsx",
  "./alerts/LegalDeadlineAlertsPage.tsx",
] as const;

describe("ROUND 8.20 board21 — Legal module child Backs honor ?ret=", () => {
  for (const rel of files) {
    it(`${rel} resolves Back from ret (no hard-coded /legal)`, () => {
      const source = readFileSync(resolve(__dirname, rel), "utf8");
      expect(source).toMatch(/resolveBackHref/);
      expect(source).not.toMatch(/backHref="\/legal"/);
    });
  }
});
