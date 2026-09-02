import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type AdvanceSplit,
  disburseCashAdvanceSplit,
  lumperLifecycleEnabled,
  validateAdvanceSplit,
} from "../lumper-cash-advance-split";

// C6 (GO-23) — the bill_payment leg's own INSERT had no JE poster call at all. Mocked separately
// from the generic query stub below so the flag-on path gets real coverage, matching this
// session's own established convention for the same fix shape (mark-disbursed #19618,
// bills-bulk #19625, insurance policy-create-atomic #19629).
const mockIsBillPaymentGlPostingEnabled = vi.fn().mockResolvedValue(false);
const mockPostSourceTransactionInClientTx = vi.fn().mockResolvedValue({ journal_entry_id: "je-1" });
vi.mock("../../accounting/bill-payment-gl.service.js", () => ({
  isBillPaymentGlPostingEnabled: (...args: unknown[]) => mockIsBillPaymentGlPostingEnabled(...args),
}));
vi.mock("../../accounting/posting-engine.service.js", () => ({
  postSourceTransactionInClientTx: (...args: unknown[]) => mockPostSourceTransactionInClientTx(...args),
}));

const mockQuery = vi.fn();
vi.mock("../../auth/db.js", () => ({
  withCurrentUser: async (_userId: string, fn: (client: { query: typeof mockQuery }) => Promise<unknown>) =>
    fn({ query: mockQuery }),
}));

describe("lumper-cash-advance-split — STEP 3b validation (the $400 split contract)", () => {
  const split400: AdvanceSplit[] = [
    { kind: "bill_payment", amount_cents: 25000, bill_id: "b1" },
    { kind: "lumper_expense", amount_cents: 15000, load_id: "l1", billable_customer_uuid: "c1" },
  ];

  it("accepts $250 + $150 = $400 (legs sum to the advance)", () => {
    expect(validateAdvanceSplit(split400, 40000)).toEqual({ ok: true });
  });

  it("FAILS LOUD when legs do not sum to the advance ($400 split vs $300 advance)", () => {
    const r = validateAdvanceSplit(split400, 30000);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe("split_sum_mismatch");
      expect(r.message).toContain("40000");
      expect(r.message).toContain("30000");
    }
  });

  it("rejects an empty split", () => {
    const r = validateAdvanceSplit([], 40000);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("empty_split");
  });

  it("rejects a non-positive or non-integer leg amount (no negative/garbage money)", () => {
    expect(validateAdvanceSplit([{ kind: "bill_payment", amount_cents: 0, bill_id: "b" }], 0).ok).toBe(false);
    expect(validateAdvanceSplit([{ kind: "bill_payment", amount_cents: -100, bill_id: "b" }], -100).ok).toBe(false);
    const frac = validateAdvanceSplit([{ kind: "lumper_expense", amount_cents: 150.5, load_id: "l" }], 150);
    expect(frac.ok).toBe(false);
    if (!frac.ok) expect(frac.error).toBe("invalid_split_amount");
  });

  it("rejects a non-positive advance total", () => {
    const r = validateAdvanceSplit(split400, 0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("invalid_advance_total");
  });

  it("feature flag is OFF by default (no lumper money behavior without explicit enable)", () => {
    const prev = process.env.LUMPER_LIFECYCLE_ENABLED;
    delete process.env.LUMPER_LIFECYCLE_ENABLED;
    expect(lumperLifecycleEnabled()).toBe(false);
    process.env.LUMPER_LIFECYCLE_ENABLED = "false";
    expect(lumperLifecycleEnabled()).toBe(false);
    process.env.LUMPER_LIFECYCLE_ENABLED = "true";
    expect(lumperLifecycleEnabled()).toBe(true);
    if (prev === undefined) delete process.env.LUMPER_LIFECYCLE_ENABLED;
    else process.env.LUMPER_LIFECYCLE_ENABLED = prev;
  });
});

describe("disburseCashAdvanceSplit — C6 bill_payment leg GL poster", () => {
  const ACTOR = "22222222-2222-4222-8222-222222222222";
  const OPCO = "11111111-1111-4111-8111-111111111111";
  const ADVANCE_ID = "ad000000-0000-4000-8000-000000000001";
  const BILL_ID = "bi000000-0000-4000-8000-000000000001";
  const BILL_PAYMENT_ID = "bp000000-0000-4000-8000-000000000001";
  const LOAD_ID = "ld000000-0000-4000-8000-000000000001";

  const splits: AdvanceSplit[] = [
    { kind: "bill_payment", amount_cents: 25000, bill_id: BILL_ID },
    { kind: "lumper_expense", amount_cents: 15000, load_id: LOAD_ID },
  ];

  let prevFlag: string | undefined;

  beforeEach(() => {
    prevFlag = process.env.LUMPER_LIFECYCLE_ENABLED;
    process.env.LUMPER_LIFECYCLE_ENABLED = "true";
    mockIsBillPaymentGlPostingEnabled.mockClear().mockResolvedValue(false);
    mockPostSourceTransactionInClientTx.mockClear().mockResolvedValue({ journal_entry_id: "je-1" });
    mockQuery.mockReset();
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT set_config")) return { rows: [] };
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return { rows: [] };
      if (sql.includes("FROM driver_finance.driver_advances")) return { rows: [{ amount: "400.00" }] };
      if (sql.includes("SELECT is_sample_data FROM accounting.bills")) return { rows: [{ is_sample_data: false }] };
      if (sql.includes("INSERT INTO accounting.bill_payments")) return { rows: [{ id: BILL_PAYMENT_ID }] };
      if (sql.includes("FROM catalogs.accounts")) return { rows: [{ id: "acct-117" }] };
      if (sql.includes("SELECT is_sample_data FROM mdata.loads")) return { rows: [{ is_sample_data: false }] };
      if (sql.includes("INSERT INTO accounting.expenses")) return { rows: [{ id: "exp-1" }] };
      if (sql.includes("INSERT INTO accounting.expense_lines")) return { rows: [] };
      if (sql.includes("events.log_event")) return { rows: [] };
      return { rows: [] };
    });
  });

  afterEach(() => {
    if (prevFlag === undefined) delete process.env.LUMPER_LIFECYCLE_ENABLED;
    else process.env.LUMPER_LIFECYCLE_ENABLED = prevFlag;
  });

  it("never calls the poster when BILL_PAYMENT_GL_POSTING_ENABLED is off (default)", async () => {
    const result = await disburseCashAdvanceSplit(ACTOR, OPCO, { advance_id: ADVANCE_ID, splits });
    expect(result.ok).toBe(true);
    expect(mockIsBillPaymentGlPostingEnabled).toHaveBeenCalledWith(OPCO, ACTOR);
    expect(mockPostSourceTransactionInClientTx).not.toHaveBeenCalled();
  });

  it("posts the bill_payment leg via postSourceTransactionInClientTx when the flag is on", async () => {
    mockIsBillPaymentGlPostingEnabled.mockResolvedValue(true);
    const result = await disburseCashAdvanceSplit(ACTOR, OPCO, { advance_id: ADVANCE_ID, splits });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.billPaymentIds).toEqual([BILL_PAYMENT_ID]);
    expect(mockPostSourceTransactionInClientTx).toHaveBeenCalledTimes(1);
    expect(mockPostSourceTransactionInClientTx).toHaveBeenCalledWith(
      expect.anything(),
      {
        operating_company_id: OPCO,
        source_transaction_type: "bill_payment",
        source_transaction_id: BILL_PAYMENT_ID,
      },
      { userId: ACTOR }
    );
  });

  it("a poster failure does not abort the split disburse (best-effort)", async () => {
    mockIsBillPaymentGlPostingEnabled.mockResolvedValue(true);
    mockPostSourceTransactionInClientTx.mockRejectedValueOnce(new Error("boom"));
    const result = await disburseCashAdvanceSplit(ACTOR, OPCO, { advance_id: ADVANCE_ID, splits });
    expect(result.ok).toBe(true);
    expect(mockPostSourceTransactionInClientTx).toHaveBeenCalledTimes(1);
  });
});
