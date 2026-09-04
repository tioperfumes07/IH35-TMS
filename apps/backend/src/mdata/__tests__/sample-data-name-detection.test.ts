import { describe, expect, it } from "vitest";
import { looksLikeSampleDataName } from "../sample-data-name-detection.js";

// G1 (GO-CLOSE-188 owner reply, 2026-08-30) — every case below is a real name observed live on prod
// (except the negative false-positive guard).
describe("looksLikeSampleDataName", () => {
  it("matches real fixture names, whatever shape they take", () => {
    expect(looksLikeSampleDataName("TEST-CUSTOMER-1")).toBe(true);
    expect(looksLikeSampleDataName("CC2-BOOKLOAD-INLINE-TEST")).toBe(true); // suffix
    expect(looksLikeSampleDataName("GUARD-TEST-customers-name-TRANSP")).toBe(true); // embedded
    expect(looksLikeSampleDataName("Cascade-void-test-20260826")).toBe(true); // lowercase
    expect(looksLikeSampleDataName("CC3 TEST Customer 20260822-1054")).toBe(true); // space-bounded
    expect(looksLikeSampleDataName("SAMPLE Customer Cascade-2046")).toBe(true);
    expect(looksLikeSampleDataName("ZZ-SAMPLE Customer A USMCA_GATEB_SAMPLE_2026-08-07")).toBe(true);
    expect(looksLikeSampleDataName("DEVIN-AUDIT-GO2136-CREATE-TEST")).toBe(true);
  });

  // Factoring doc 09-04-2026: 11 real USMCA customer rows found live, none containing
  // "test"/"demo"/"sample", quarantined by hand because the create path let them through.
  it("matches seat/session smoke-identifier prefixes, even with no test/demo/sample word", () => {
    expect(looksLikeSampleDataName("CC2-BATTERY-20260807-CUSTOMER-01")).toBe(true);
    expect(looksLikeSampleDataName("CC3-CUSTOMER-DEACTIVATE-CONTROL2-20260826")).toBe(true);
    expect(looksLikeSampleDataName("CODEX-AUDIT-SPINE-20260816-0320")).toBe(true);
    expect(looksLikeSampleDataName("P23-SMOKE-1786500785935")).toBe(true);
    expect(looksLikeSampleDataName("USMCA-CODEX-CREATE-20260810-0117")).toBe(true);
    expect(looksLikeSampleDataName("USMCA-CODEX-SUBCUSTOMER-20260810-0126")).toBe(true);
    expect(looksLikeSampleDataName("USMCA_P43_BILLING_SMOKE_20260812")).toBe(true);
  });

  it("does NOT false-positive on a real name that merely contains the substring", () => {
    // Loves-IN471-DEMOTTE — a real Love's truck stop vendor name, found live on prod. "demo" is a
    // substring but not a word — a bare-substring pattern would have wrongly flagged it.
    expect(looksLikeSampleDataName("Loves-IN471-DEMOTTE (deleted)")).toBe(false);
  });

  it("does not flag an ordinary real business name", () => {
    expect(looksLikeSampleDataName("Acme Freight LLC")).toBe(false);
    expect(looksLikeSampleDataName("Bank of America")).toBe(false);
  });

  it("handles null/undefined/empty safely", () => {
    expect(looksLikeSampleDataName(null)).toBe(false);
    expect(looksLikeSampleDataName(undefined)).toBe(false);
    expect(looksLikeSampleDataName("")).toBe(false);
  });
});
