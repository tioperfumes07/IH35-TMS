import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const files = [
  "./CSAScore.tsx",
  "./CSAMitigationQueue.tsx",
  "./anomaly/AnomalyAlertsPage.tsx",
] as const;

describe("ROUND 8.20 Safety — child Backs honor ?ret=", () => {
  for (const rel of files) {
    it(`${rel} resolves Back from ret (no hard-coded /safety alone)`, () => {
      const source = readFileSync(resolve(__dirname, rel), "utf8");
      expect(source).toMatch(/resolveBackHref/);
      expect(source).not.toMatch(/backHref="\/safety"/);
    });
  }
});
