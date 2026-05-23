import { describe, expect, it } from "vitest";
import { computeMissingMigrations } from "../../../../../scripts/generate-batch-8-ledger-backfill.mjs";

describe("batch generator missing detection (DS-REMEDIATE-15)", () => {
  it("classifies file as missing when present in system ledger only", () => {
    const files = ["0161_p6_t11193_driver_pwa_hardening.sql"];
    const systemLedger = new Set(files);
    const appLedger = new Set<string>();

    const missing = computeMissingMigrations(files, systemLedger, appLedger);

    expect(missing).toContain("0161_p6_t11193_driver_pwa_hardening.sql");
  });
});
