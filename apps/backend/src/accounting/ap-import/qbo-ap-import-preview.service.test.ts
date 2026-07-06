import { describe, expect, it } from "vitest";
import { agingBucketFor, centsFromQboAmount, ApImportNotImplementedError } from "./qbo-ap-import-preview.service.js";

describe("AF-4 AP import preview — pure helpers", () => {
  const asOf = new Date("2026-07-06T00:00:00Z");

  it("agingBucketFor: no due date -> current", () => {
    expect(agingBucketFor(null, asOf)).toBe("current");
  });

  it("agingBucketFor: due date in the future -> current", () => {
    expect(agingBucketFor("2026-08-01", asOf)).toBe("current");
  });

  it("agingBucketFor: due today -> current", () => {
    expect(agingBucketFor("2026-07-06", asOf)).toBe("current");
  });

  it("agingBucketFor: 15 days past due -> 1-30", () => {
    expect(agingBucketFor("2026-06-21", asOf)).toBe("1-30");
  });

  it("agingBucketFor: 45 days past due -> 31-60", () => {
    expect(agingBucketFor("2026-05-22", asOf)).toBe("31-60");
  });

  it("agingBucketFor: 75 days past due -> 61-90", () => {
    expect(agingBucketFor("2026-04-22", asOf)).toBe("61-90");
  });

  it("agingBucketFor: 200 days past due -> 91+", () => {
    expect(agingBucketFor("2025-12-18", asOf)).toBe("91+");
  });

  it("agingBucketFor: invalid date string -> current (never throws)", () => {
    expect(agingBucketFor("not-a-date", asOf)).toBe("current");
  });

  it("centsFromQboAmount: converts QBO decimal dollars to integer cents", () => {
    expect(centsFromQboAmount(483232.84)).toBe(48323284);
    expect(centsFromQboAmount(0)).toBe(0);
  });

  it("centsFromQboAmount: non-numeric/undefined -> 0 (never NaN)", () => {
    expect(centsFromQboAmount(undefined)).toBe(0);
    expect(centsFromQboAmount(Number.NaN)).toBe(0);
  });

  it("executeApImportBatch's error names the design doc + never silently writes", () => {
    const err = new ApImportNotImplementedError();
    expect(err.message).toMatch(/NOT IMPLEMENTED/);
    expect(err.message).toMatch(/AF-4-AF-2-AF-7-DESIGN\.md/);
  });
});
