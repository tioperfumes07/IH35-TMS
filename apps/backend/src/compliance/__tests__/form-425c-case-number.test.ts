/**
 * Form 425C — case-number validation guard (non-financial filing-integrity fix).
 *
 * A Chapter 11 Monthly Operating Report is a court filing. The frontend used to silently substitute a
 * placeholder case number ("25-00000") when the entity profile had none set, so a filing PDF could be
 * generated / marked filed carrying a fabricated docket number. This guard proves the shared validator
 * refuses empty AND the known placeholder, and accepts a real case number — so the two call sites
 * (generateForm425CPdf + the mark-filed route) can't regress into emitting a placeholder filing.
 */
import { describe, expect, it } from "vitest";
import { isInvalidCaseNumber } from "../form-425c-pdf.js";

describe("isInvalidCaseNumber — refuses placeholder / empty case numbers on a court filing", () => {
  it("rejects an empty / whitespace-only case number", () => {
    expect(isInvalidCaseNumber("")).toBe(true);
    expect(isInvalidCaseNumber("   ")).toBe(true);
    expect(isInvalidCaseNumber(null)).toBe(true);
    expect(isInvalidCaseNumber(undefined)).toBe(true);
  });

  it("rejects the known placeholder the frontend used to substitute", () => {
    expect(isInvalidCaseNumber("25-00000")).toBe(true);
    expect(isInvalidCaseNumber("  25-00000  ")).toBe(true);
  });

  it("accepts a real bankruptcy case number", () => {
    expect(isInvalidCaseNumber("25-50123")).toBe(false);
    expect(isInvalidCaseNumber("23-90001-elm11")).toBe(false);
  });
});
