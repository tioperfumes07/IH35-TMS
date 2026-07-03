import { describe, expect, it } from "vitest";
import {
  assertResolvable,
  computeBankCountExceptions,
  computeCategorizationExceptions,
  ReconResolveError,
  type ReconEntry,
} from "./recon-engine.service.js";

const e = (over: Partial<ReconEntry>): ReconEntry => ({
  txn_date: "2025-06-01", amount_cents: 12500, reference: "INV-1", account_ref: "acctA",
  source_ref: { kind: "bank_txn", id: "t1" }, ...over,
});

describe("recon-engine comparison (RECON-01)", () => {
  it("AM: flags COUNT_MISMATCH and SUM_MISMATCH", () => {
    const tms = [e({ amount_cents: 100 }), e({ amount_cents: 200 })];
    const qbo = [e({ amount_cents: 100 })]; // one fewer, sum differs
    const ex = computeBankCountExceptions(tms, qbo);
    expect(ex.map((x) => x.exception_class).sort()).toEqual(["COUNT_MISMATCH", "SUM_MISMATCH"]);
    expect(ex.find((x) => x.field === "count")).toMatchObject({ tms_value: "2", qbo_value: "1" });
    expect(ex.find((x) => x.field === "sum_cents")).toMatchObject({ tms_value: "300", qbo_value: "100" });
  });

  it("AM: clean when count + sum agree", () => {
    const tms = [e({ amount_cents: 100 }), e({ amount_cents: 200 })];
    const qbo = [e({ amount_cents: 200 }), e({ amount_cents: 100 })];
    expect(computeBankCountExceptions(tms, qbo)).toHaveLength(0);
  });

  it("PM: flags EVERY categorization divergence (no threshold), matched by date+amount+ref", () => {
    const tms = [e({ reference: "INV-1", account_ref: "6010-fuel" }), e({ reference: "INV-2", amount_cents: 500, account_ref: "6020-tolls" })];
    const qbo = [e({ reference: "INV-1", account_ref: "6011-diesel" }), e({ reference: "INV-2", amount_cents: 500, account_ref: "6020-tolls" })];
    const ex = computeCategorizationExceptions(tms, qbo);
    expect(ex).toHaveLength(1); // only INV-1 diverges; INV-2 matches
    expect(ex[0]).toMatchObject({ exception_class: "CATEGORIZATION_DIVERGENCE", tms_value: "6010-fuel", qbo_value: "6011-diesel" });
  });

  it("PM: an unmatched TMS row → REFERENCE_INTEGRITY", () => {
    const tms = [e({ reference: "ORPHAN", amount_cents: 999 })];
    const ex = computeCategorizationExceptions(tms, []);
    expect(ex[0].exception_class).toBe("REFERENCE_INTEGRITY");
  });

  it("resolve: maker≠checker, system cannot resolve, note required", () => {
    expect(() => assertResolvable("userA", "userA", "ok")).toThrow(ReconResolveError); // maker is checker
    expect(() => assertResolvable("userA", null, "ok")).toThrow(/system/); // system identity
    expect(() => assertResolvable("userA", "userB", "  ")).toThrow(/note/); // blank note
    expect(() => assertResolvable("userA", "userB", "explained")).not.toThrow(); // valid
  });
});
