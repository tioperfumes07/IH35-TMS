/**
 * BCF-02 regression test: when linked_driver_bill_id is supplied to createDriverCashAdvanceCore,
 * the bill must (a) belong to the same driver as the advance, (b) be live (open + not voided),
 * and (c) be locked FOR UPDATE before the allocation read.
 *
 * Root cause: cash-advance-create.ts:199 SELECT only fetched gross_amount_cents with no FOR UPDATE
 * and no driver/status validation, so a bill from another driver or a voided/settled bill could
 * receive allocations.
 *
 * Refusal vocabulary: 6dc766af05 (#26661, "a cash advance's applied bill must match driver + load + be live, locked
 * FOR UPDATE", merged 2026-10-12 12:19 -0500) shipped this check in cash-advance-create.ts with named codes
 * (linked_driver_bill_driver_mismatch / _voided / _settled / _load_mismatch). This test came in later the same day with
 * #26655 (8e00b8793d), which carried no code change, so it pinned codes that never shipped. "Settled" is
 * settled_in_settlement_id (schema 0141: status is open/approved/paid/void/disputed — there is no 'settled'; the settle
 * writers set settled_in_settlement_id + status 'paid', settlement-bill-payment-posting.service.ts / settlement-ap-chain).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const query = vi.fn();
  return {
    query,
    mockAudit: vi.fn(async () => undefined),
    mockIsEnabled: vi.fn(async () => false),
    mockNextDisplayId: vi.fn(async () => ({ displayId: "ADV-001", advisoryLockReleased: true })),
    mockEnsureSubAccount: vi.fn(async () => ({ accountId: "sub-acct-id" })),
    mockResolveRoleAccount: vi.fn(async () => ({ accountId: "role-acct-id" })),
    mockReleaseBankLines: vi.fn(async () => undefined),
    mockVoidSettlementDeduction: vi.fn(async () => undefined),
    mockSameEntityLoadSql: vi.fn(() => "TRUE"),
    mockPost: vi.fn(async () => ({ result: "posted" })),
  };
});

vi.mock("../../audit/crud-audit.js", () => ({ appendCrudAudit: mocks.mockAudit }));
vi.mock("../../lib/feature-flags/service.js", () => ({ isEnabled: mocks.mockIsEnabled }));
vi.mock("../display-id.js", () => ({ nextCashAdvanceDisplayId: mocks.mockNextDisplayId }));
vi.mock("../../driver-finance/driver-advance-account-resolver.js", () => ({
  ensureDriverAdvanceSubAccount: mocks.mockEnsureSubAccount,
  DriverAdvanceAccountError: class DriverAdvanceAccountError extends Error {},
}));
vi.mock("../../accounting/coa-roles/resolver.service.js", () => ({ resolveRoleAccount: mocks.mockResolveRoleAccount }));
vi.mock("../../accounting/void.service.js", () => ({ releaseBankLinesNamingDocument: mocks.mockReleaseBankLines }));
vi.mock("../../driver-finance/settlement-deduction-void.service.js", () => ({ voidSettlementDeduction: mocks.mockVoidSettlementDeduction }));
vi.mock("../../accounting/load-trailer.sql.js", () => ({ sameEntityLoadCompanyTrailerSql: mocks.mockSameEntityLoadSql }));
vi.mock("../../accounting/posting-engine.service.js", () => ({ postSourceTransactionInClientTx: mocks.mockPost }));

const { createDriverCashAdvanceCore } = await import("../cash-advance-create.js");

const OPCO = "11111111-1111-4111-8111-111111111111";
const ACTOR = "22222222-2222-4222-8222-222222222222";
const DRIVER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const DRIVER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BILL_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const LOAD_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function makeClient(billRow: Record<string, unknown> | null) {
  const queryCalls: { sql: string; params?: unknown[] }[] = [];
  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    queryCalls.push({ sql, params });
    const norm = sql.replace(/\s+/g, " ").trim();
    // Bill SELECT
    if (norm.includes("FROM driver_finance.driver_bills") && norm.includes("SELECT")) {
      return { rows: billRow ? [billRow] : [] };
    }
    // Prior advances sum
    if (norm.includes("FROM driver_finance.driver_advances") && norm.includes("SUM")) {
      return { rows: [{ covered: "0" }] };
    }
    // Any other query
    return { rows: [] };
  });
  return { query, queryCalls };
}

describe("BCF-02: linked_driver_bill validation — driver match + live + FOR UPDATE", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("BCF-02-A: bill belongs to a DIFFERENT driver → 422 linked_driver_bill_driver_mismatch (regression gate)", async () => {
    const { query } = makeClient({
      gross_amount_cents: 50000,
      driver_id: DRIVER_B, // different from DRIVER_A in the advance
      load_id: LOAD_ID,
      status: "open",
      voided_at: null,
    });

    const r = await createDriverCashAdvanceCore(
      { query } as never,
      ACTOR,
      OPCO,
      {
        driver_id: DRIVER_A, // advance for driver A
        amount: 100,
        purpose: "other",
        disbursement_method: "in_person_check",
        recipient_info: { recipient_type: "driver" },
        linked_driver_bill_id: BILL_ID,
      }
    );

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe(422);
      expect(r.error).toBe("linked_driver_bill_driver_mismatch"); // 6dc766af05
    }
  });

  it("BCF-02-B: bill is voided → 409 linked_driver_bill_voided", async () => {
    const { query } = makeClient({
      gross_amount_cents: 50000,
      driver_id: DRIVER_A,
      load_id: LOAD_ID,
      status: "open",
      voided_at: "2026-10-01T00:00:00Z", // voided
      settled_in_settlement_id: null,
    });

    const r = await createDriverCashAdvanceCore(
      { query } as never,
      ACTOR,
      OPCO,
      {
        driver_id: DRIVER_A,
        amount: 100,
        purpose: "other",
        disbursement_method: "in_person_check",
        recipient_info: { recipient_type: "driver" },
        linked_driver_bill_id: BILL_ID,
      }
    );

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe(409);
      expect(r.error).toBe("linked_driver_bill_voided"); // 6dc766af05
    }
  });

  it("BCF-02-C: bill is settled (settled_in_settlement_id set, status=paid) → 409 linked_driver_bill_settled", async () => {
    const { query } = makeClient({
      gross_amount_cents: 50000,
      driver_id: DRIVER_A,
      load_id: LOAD_ID,
      status: "paid", // the settle writers set status 'paid' + settled_in_settlement_id (there is no 'settled' status)
      voided_at: null,
      settled_in_settlement_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    });

    const r = await createDriverCashAdvanceCore(
      { query } as never,
      ACTOR,
      OPCO,
      {
        driver_id: DRIVER_A,
        amount: 100,
        purpose: "other",
        disbursement_method: "in_person_check",
        recipient_info: { recipient_type: "driver" },
        linked_driver_bill_id: BILL_ID,
      }
    );

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe(409);
      expect(r.error).toBe("linked_driver_bill_settled"); // 6dc766af05
    }
  });

  it("BCF-02-D: bill SELECT must include FOR UPDATE (concurrency lock)", async () => {
    const billQueryCalls: string[] = [];
    const query = vi.fn(async (sql: string, params?: unknown[]) => {
      const norm = sql.replace(/\s+/g, " ").trim();
      if (norm.includes("FROM driver_finance.driver_bills") && norm.includes("SELECT")) {
        billQueryCalls.push(sql);
        return {
          rows: [{
            gross_amount_cents: 50000,
            driver_id: DRIVER_A,
            load_id: LOAD_ID,
            status: "open",
            voided_at: null,
          }],
        };
      }
      if (norm.includes("FROM driver_finance.driver_advances") && norm.includes("SUM")) {
        return { rows: [{ covered: "0" }] };
      }
      return { rows: [] };
    });

    await createDriverCashAdvanceCore(
      { query } as never,
      ACTOR,
      OPCO,
      {
        driver_id: DRIVER_A,
        amount: 100,
        purpose: "other",
        disbursement_method: "in_person_check",
        recipient_info: { recipient_type: "driver" },
        linked_driver_bill_id: BILL_ID,
      }
    );

    // The bill SELECT must contain FOR UPDATE to prevent concurrent allocation races.
    expect(billQueryCalls.length).toBeGreaterThan(0);
    const billQuery = billQueryCalls[0];
    expect(billQuery.toUpperCase()).toContain("FOR UPDATE");
  });
});
