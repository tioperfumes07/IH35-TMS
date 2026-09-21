import { describe, expect, it } from "vitest";
import { assertFaroDailyImportProvenance } from "./faro-daily-import-provenance.js";

const TRUSTED_LINE = {
  invoice_number: "13508",
  customer_name: "NCC Logistics",
  gross_amount_cents: 250000,
  advance_amount_cents: 241500,
  reserve_amount_cents: 3750,
  fee_amount_cents: 4750,
  chargeback_amount_cents: 0,
  net_amount_cents: 241500,
  due_on: "2026-08-10",
};

// The exact shape found live in prod on c1e27709-28f7-4886-860f-b9597ddad71a before the
// 2026-09-22 correction — proof it was never written by upsertFaroDailyImportOnClient.
const UNTRUSTED_LINE = {
  po: "4483",
  inv: "002",
  date: "08/10/2026",
  debtor: "IMPACT BULK LOGISTICS LLC",
  escrow_reserve_cents: 4500,
};

describe("assertFaroDailyImportProvenance", () => {
  it("trusts a well-formed FaroCsvLine payload", () => {
    expect(assertFaroDailyImportProvenance({ lines: [TRUSTED_LINE] })).toEqual({ trusted: true });
  });

  it("trusts an empty lines array (structurally valid)", () => {
    expect(assertFaroDailyImportProvenance({ lines: [] })).toEqual({ trusted: true });
  });

  it("flags the exact untrusted shape found live in prod", () => {
    const result = assertFaroDailyImportProvenance({ lines: [UNTRUSTED_LINE] });
    expect(result.trusted).toBe(false);
    if (!result.trusted) {
      expect(result.reason).toContain("untrusted provenance");
    }
  });

  it("flags a raw_payload that is not an object", () => {
    expect(assertFaroDailyImportProvenance(null).trusted).toBe(false);
    expect(assertFaroDailyImportProvenance("garbage").trusted).toBe(false);
    expect(assertFaroDailyImportProvenance(42).trusted).toBe(false);
  });

  it("flags raw_payload.lines missing or not an array", () => {
    expect(assertFaroDailyImportProvenance({}).trusted).toBe(false);
    expect(assertFaroDailyImportProvenance({ lines: "not-an-array" }).trusted).toBe(false);
  });

  it("flags a line missing a required numeric field", () => {
    const { gross_amount_cents, ...withoutGross } = TRUSTED_LINE;
    const result = assertFaroDailyImportProvenance({ lines: [withoutGross] });
    expect(result.trusted).toBe(false);
    if (!result.trusted) {
      expect(result.reason).toContain("gross_amount_cents");
    }
  });

  it("flags a line with a non-string or blank invoice_number", () => {
    expect(assertFaroDailyImportProvenance({ lines: [{ ...TRUSTED_LINE, invoice_number: "" }] }).trusted).toBe(false);
    expect(assertFaroDailyImportProvenance({ lines: [{ ...TRUSTED_LINE, invoice_number: 13508 }] }).trusted).toBe(false);
  });

  it("a mixed batch (one trusted, one untrusted line) is flagged", () => {
    const result = assertFaroDailyImportProvenance({ lines: [TRUSTED_LINE, UNTRUSTED_LINE] });
    expect(result.trusted).toBe(false);
  });
});
