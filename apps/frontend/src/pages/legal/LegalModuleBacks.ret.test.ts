import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const files = [
  "./LegalPoliciesPage.tsx",
  "./LegalAttorneyReviewPage.tsx",
  "./reports/LegalReportsLandingPage.tsx",
  "./alerts/LegalDeadlineAlertsPage.tsx",
  "./templates/LegalTemplateDetailPage.tsx",
  "./templates/LegalTemplatesListPage.tsx",
] as const;

describe("ROUND 8.20 board21 — Legal module child Backs honor ?ret=", () => {
  for (const rel of files) {
    it(`${rel} resolves Back from ret (no hard-coded /legal)`, () => {
      const source = readFileSync(resolve(__dirname, rel), "utf8");
      // List pages attach ret via withReturnContext; leaf pages resolveBackHref (or BackArrowHeader).
      expect(source).toMatch(/resolveBackHref|withReturnContext/);
      expect(source).not.toMatch(/backHref="\/legal"/);
    });
  }
});
