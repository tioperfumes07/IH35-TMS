import { describe, expect, it } from "vitest";
import {
  LOAD_EXEMPTION_REASON_MIN_LENGTH,
  companyCostExemptionReason,
  resolveLineLoadExemption,
} from "../expense-line-load-exemption.js";

// LEAD 443.105 #2 — one rule for every expense-line writer: a load, a caller's reason, a refusal (load-required), or a
// company-cost reason that names the account and the document.
describe("resolveLineLoadExemption", () => {
  it("a line with a load needs no reason", () => {
    expect(resolveLineLoadExemption({ loadId: "load-1", reason: "ignored reason text here", context: "x" })).toBeNull();
  });
  it("the caller's reason wins, trimmed", () => {
    expect(resolveLineLoadExemption({ loadId: null, reason: "  Owner: yard sweep supplies for the shop  ", context: "x" })).toBe(
      "Owner: yard sweep supplies for the shop"
    );
  });
  it("a load-REQUIRED (G18) line with neither load nor reason is never exempted — the DB refuses it by name", () => {
    expect(resolveLineLoadExemption({ loadId: null, reason: null, loadRequired: true, accountLabel: "5100 Diesel", context: "expense 2026-10-12" })).toBeNull();
    expect(resolveLineLoadExemption({ loadId: null, reason: "   ", loadRequired: true, context: "expense 2026-10-12" })).toBeNull();
  });
  it("otherwise a company-cost reason naming the account and the document", () => {
    expect(resolveLineLoadExemption({ loadId: null, accountLabel: "6300 Bank Service Charges & Wire Fees", context: "bank line 2026-01-15" })).toBe(
      "Company cost — 6300 Bank Service Charges & Wire Fees — not tied to a load (bank line 2026-01-15)"
    );
  });
});

describe("companyCostExemptionReason", () => {
  it("always meets the DB trigger's 20-char floor, even with no account or context", () => {
    const r = companyCostExemptionReason({ accountLabel: null, context: "" });
    expect(r.length).toBeGreaterThanOrEqual(LOAD_EXEMPTION_REASON_MIN_LENGTH);
    expect(r).toBe("Company cost — an expense account — not tied to a load (no source document)");
  });
});
