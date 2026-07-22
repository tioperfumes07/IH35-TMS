import { describe, expect, it } from "vitest";
import {
  createClaimBodySchema,
  INSURANCE_CLAIM_FAULT_VALUES,
  INSURANCE_CLAIM_RECOVERY_RAIL_VALUES,
  INSURANCE_CLAIM_REPAIR_BOOKS_TREATMENT_VALUES,
  listClaimsQuerySchema,
  updateClaimBodySchema,
} from "../claim.shared.js";

const BASE_CREATE = {
  operating_company_id: "11111111-1111-4111-8111-111111111111",
  claim_number: "CLM-001",
  policy_id: "22222222-2222-4222-8222-222222222222",
  accident_date: "2026-05-01",
  reported_date: "2026-05-02",
};

describe("claim.shared — WIZARD-CLAIM-ECONOMICS-DEPTH slice 2 (202607730000, HOLD, not yet on prod)", () => {
  it("createClaimBodySchema accepts a fully-specified economics slice", () => {
    const parsed = createClaimBodySchema.safeParse({
      ...BASE_CREATE,
      trailer_id: "33333333-3333-4333-8333-333333333333",
      fault: "company",
      driver_responsible: false,
      deductible_cents: 250000,
      recovery_rail: "escrow",
      repair_books_treatment: "expense",
    });
    expect(parsed.success).toBe(true);
  });

  it("createClaimBodySchema is optional on all economics fields (backward-compatible with slice 1 callers)", () => {
    const parsed = createClaimBodySchema.safeParse(BASE_CREATE);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.fault).toBeUndefined();
      expect(parsed.data.recovery_rail).toBeUndefined();
      expect(parsed.data.repair_books_treatment).toBeUndefined();
    }
  });

  it("rejects an out-of-enum fault value (no silent coercion)", () => {
    const parsed = createClaimBodySchema.safeParse({ ...BASE_CREATE, fault: "everyone" });
    expect(parsed.success).toBe(false);
  });

  it("owner lock #1 — recovery_rail enum is exactly escrow|settlement|split|ask (never widened silently)", () => {
    expect(INSURANCE_CLAIM_RECOVERY_RAIL_VALUES).toEqual(["escrow", "settlement", "split", "ask"]);
    const parsed = createClaimBodySchema.safeParse({ ...BASE_CREATE, recovery_rail: "auto" });
    expect(parsed.success).toBe(false);
  });

  it("owner lock #2 (Choice Z) — repair_books_treatment enum is exactly expense|capitalize|ask", () => {
    expect(INSURANCE_CLAIM_REPAIR_BOOKS_TREATMENT_VALUES).toEqual(["expense", "capitalize", "ask"]);
    const parsed = createClaimBodySchema.safeParse({ ...BASE_CREATE, repair_books_treatment: "writeoff" });
    expect(parsed.success).toBe(false);
  });

  it("fault enum is exactly undetermined|company|third_party|shared", () => {
    expect(INSURANCE_CLAIM_FAULT_VALUES).toEqual(["undetermined", "company", "third_party", "shared"]);
  });

  it("driver_responsible accepts explicit null (tri-state: not yet determined)", () => {
    const parsed = createClaimBodySchema.safeParse({ ...BASE_CREATE, driver_responsible: null });
    expect(parsed.success).toBe(true);
  });

  it("rejects a negative deductible_cents", () => {
    const parsed = createClaimBodySchema.safeParse({ ...BASE_CREATE, deductible_cents: -1 });
    expect(parsed.success).toBe(false);
  });

  it("rejects a non-integer deductible_cents (money is always whole cents)", () => {
    const parsed = createClaimBodySchema.safeParse({ ...BASE_CREATE, deductible_cents: 100.5 });
    expect(parsed.success).toBe(false);
  });

  it("updateClaimBodySchema allows patching a single economics field", () => {
    const parsed = updateClaimBodySchema.safeParse({ recovery_rail: "settlement" });
    expect(parsed.success).toBe(true);
  });

  it("updateClaimBodySchema allows clearing trailer_id back to null", () => {
    const parsed = updateClaimBodySchema.safeParse({ trailer_id: null });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.trailer_id).toBeNull();
  });

  it("listClaimsQuerySchema accepts the trailer_id reverse-drill filter alongside load_id", () => {
    const parsed = listClaimsQuerySchema.safeParse({
      operating_company_id: BASE_CREATE.operating_company_id,
      trailer_id: "33333333-3333-4333-8333-333333333333",
      load_id: "44444444-4444-4444-8444-444444444444",
    });
    expect(parsed.success).toBe(true);
  });
});
