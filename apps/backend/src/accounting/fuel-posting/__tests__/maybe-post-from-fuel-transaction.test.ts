import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  FUEL_EXPENSE_GL_POSTING_FLAG_KEY,
  mapFuelTypeToPostingKind,
  maybePostFuelExpenseFromCanonicalTxn,
  flushFuelGlPostsAfterCommit,
  resolveCompanyDirectCreditPreference,
  type FuelTxnGlPostCandidate,
} from "../maybe-post-from-fuel-transaction.service.js";

const { mockIsEnabled, mockWithLuciaBypass, mockPostFuelExpenseFromEvent } = vi.hoisted(() => {
  const query = vi.fn(async () => ({ rows: [] }));
  return {
    mockIsEnabled: vi.fn(),
    mockWithLuciaBypass: vi.fn(async (fn: (client: { query: typeof query }) => unknown) => fn({ query })),
    mockPostFuelExpenseFromEvent: vi.fn(),
  };
});

vi.mock("../../../auth/db.js", () => ({
  withLuciaBypass: mockWithLuciaBypass,
}));

vi.mock("../../../lib/feature-flags/service.js", () => ({
  isEnabled: mockIsEnabled,
}));

vi.mock("../poster.service.js", () => ({
  postFuelExpenseFromEvent: mockPostFuelExpenseFromEvent,
}));

const BASE: FuelTxnGlPostCandidate = {
  operating_company_id: "11111111-1111-4111-8111-111111111111",
  actor_user_id: "22222222-2222-4222-8222-222222222222",
  fuel_transaction_id: "33333333-3333-4333-8333-333333333333",
  fuel_type: "diesel",
  transaction_at: "2026-07-15T12:00:00.000Z",
  amount_cents: 18244,
  driver_id: "44444444-4444-4444-8444-444444444444",
  location_state: "TX",
  gallons: 50,
  cash_advance: false,
};

describe("mapFuelTypeToPostingKind", () => {
  it("maps canonical fuel_transactions types onto Block-27 categories", () => {
    expect(mapFuelTypeToPostingKind("diesel")).toBe("diesel");
    expect(mapFuelTypeToPostingKind("def")).toBe("def");
    expect(mapFuelTypeToPostingKind("reefer_diesel")).toBe("reefer");
    expect(mapFuelTypeToPostingKind("gas")).toBe("misc");
    expect(mapFuelTypeToPostingKind("other")).toBe("misc");
  });
});

describe("resolveCompanyDirectCreditPreference", () => {
  // R-30.1-A (2026-09-22): the old blanket "any card signal -> ap" behavior is the exact defect
  // that drove GL 2000 (A/P control) to -108,938.77 against a $0.00 open bills subledger --
  // fuel-card purchases carry no bill, so crediting the generic AP control account for them was
  // always wrong. The credit now resolves PER RAIL from a POSITIVELY IDENTIFIED card
  // (fuel_card_code / relay_fuel_transaction_id), never a blanket "ap" fallback for any card-shaped
  // signal. "ap" is no longer reachable from this function at all except via an explicit caller
  // override (see "explicit override wins" below).
  it("Relay settle (identified via relay_fuel_transaction_id) -> relay_fuel_wallet, never ap", () => {
    expect(
      resolveCompanyDirectCreditPreference({
        ...BASE,
        relay_fuel_transaction_id: "66666666-6666-4666-8666-666666666666",
      })
    ).toBe("relay_fuel_wallet");
  });
  it("fuel_card_code DREAMLINE/RELAY resolves the rail directly", () => {
    expect(resolveCompanyDirectCreditPreference(BASE, { fuel_card_code: "DREAMLINE" })).toBe("dreamline_card_payable");
    expect(resolveCompanyDirectCreditPreference(BASE, { fuel_card_code: "RELAY" })).toBe("relay_fuel_wallet");
  });
  it("a card is signaled but the rail cannot be identified -> fails closed (throws), never ap_control", () => {
    expect(() => resolveCompanyDirectCreditPreference({ ...BASE, has_fuel_card: true })).toThrow(
      /card is signaled.*rail could not be identified/
    );
    expect(() =>
      resolveCompanyDirectCreditPreference({ ...BASE, fuel_card_id: "55555555-5555-4555-8555-555555555555" })
    ).toThrow(/card is signaled.*rail could not be identified/);
    expect(() =>
      resolveCompanyDirectCreditPreference(BASE, { fuel_card_id: null, notes: "card=****1234", source: "import" })
    ).toThrow(/card is signaled.*rail could not be identified/);
  });

  it("true cash / no card signal → cash", () => {
    expect(resolveCompanyDirectCreditPreference(BASE)).toBe("cash");
    expect(resolveCompanyDirectCreditPreference(BASE, { fuel_card_id: null, notes: null, source: "manual" })).toBe(
      "cash"
    );
  });

  it("explicit override wins", () => {
    expect(resolveCompanyDirectCreditPreference({ ...BASE, has_fuel_card: true, company_direct_credit: "cash" })).toBe(
      "cash"
    );
  });
});

describe("maybePostFuelExpenseFromCanonicalTxn", () => {
  beforeEach(() => {
    mockIsEnabled.mockReset();
    mockWithLuciaBypass.mockClear();
    mockPostFuelExpenseFromEvent.mockReset();
  });

  it("documents the gate flag as EXPENSE_GL_POSTING_ENABLED", () => {
    expect(FUEL_EXPENSE_GL_POSTING_FLAG_KEY).toBe("EXPENSE_GL_POSTING_ENABLED");
  });

  it("flag OFF → no-op (does not call poster)", async () => {
    mockIsEnabled.mockResolvedValue(false);
    const result = await maybePostFuelExpenseFromCanonicalTxn(BASE);
    expect(result).toEqual({ status: "skipped_flag_off" });
    expect(mockPostFuelExpenseFromEvent).not.toHaveBeenCalled();
    expect(mockIsEnabled).toHaveBeenCalledWith(
      expect.anything(),
      "EXPENSE_GL_POSTING_ENABLED",
      expect.objectContaining({ operating_company_id: BASE.operating_company_id })
    );
  });

  it("flag ON → posts once via postFuelExpenseFromEvent", async () => {
    mockIsEnabled.mockResolvedValue(true);
    mockPostFuelExpenseFromEvent.mockResolvedValue({
      result: "posted",
      posting_batch_id: "batch-1",
      journal_entry_id: "je-1",
      journal_entry_posting_ids: ["jep-1", "jep-2"],
      idempotency_key: "ih35:fuel-posting:v1:...",
      account_resolution_trace: [],
    });

    const result = await maybePostFuelExpenseFromCanonicalTxn(BASE);
    expect(result.status).toBe("posted");
    expect(mockPostFuelExpenseFromEvent).toHaveBeenCalledTimes(1);
    expect(mockPostFuelExpenseFromEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        operating_company_id: BASE.operating_company_id,
        fuel_event_id: BASE.fuel_transaction_id,
        fuel_kind: "diesel",
        amount_cents: 18244,
        posting_path: "company_direct",
        company_direct_credit: "cash",
      })
    );
  });

  it("RANK2-FUEL-JE-CLASS: threads unit_id/trailer_id read from fuel.fuel_transactions into the poster", async () => {
    mockIsEnabled.mockResolvedValue(true);
    mockPostFuelExpenseFromEvent.mockResolvedValue({
      result: "posted",
      posting_batch_id: "batch-1",
      journal_entry_id: "je-1",
      journal_entry_posting_ids: ["jep-1", "jep-2"],
      idempotency_key: "k",
      account_resolution_trace: [],
    });
    mockWithLuciaBypass.mockImplementationOnce(async (fn: (client: { query: (sql: string) => Promise<{ rows: unknown[] }> }) => unknown) =>
      fn({
        query: async () => ({ rows: [] }),
      })
    );
    mockWithLuciaBypass.mockImplementationOnce(async (fn: (client: { query: (sql: string) => Promise<{ rows: unknown[] }> }) => unknown) =>
      fn({
        query: async (sql: string) => {
          if (sql.includes("FROM fuel.fuel_transactions")) {
            return {
              rows: [
                {
                  fuel_card_id: null,
                  notes: null,
                  source: "relay_ingest",
                  unit_id: "77777777-7777-4777-8777-777777777777",
                  trailer_id: "88888888-8888-4888-8888-888888888888",
                },
              ],
            };
          }
          return { rows: [] };
        },
      })
    );

    await maybePostFuelExpenseFromCanonicalTxn(BASE);

    expect(mockPostFuelExpenseFromEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        unit_id: "77777777-7777-4777-8777-777777777777",
        trailer_id: "88888888-8888-4888-8888-888888888888",
      })
    );
  });

  it("FUEL-08 / R-30.1-A: Relay settle credits relay_fuel_wallet -- never cash, never ap_control", async () => {
    mockIsEnabled.mockResolvedValue(true);
    mockPostFuelExpenseFromEvent.mockResolvedValue({
      result: "posted",
      posting_batch_id: "batch-1",
      journal_entry_id: "je-1",
      journal_entry_posting_ids: ["jep-1"],
      idempotency_key: "k",
      account_resolution_trace: [],
    });
    await maybePostFuelExpenseFromCanonicalTxn({
      ...BASE,
      relay_fuel_transaction_id: "66666666-6666-4666-8666-666666666666",
      has_fuel_card: true,
    });
    expect(mockPostFuelExpenseFromEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        posting_path: "company_direct",
        company_direct_credit: "relay_fuel_wallet",
      })
    );
  });

  it("flag ON + second call → already_posted (idempotent, still one logical post)", async () => {
    mockIsEnabled.mockResolvedValue(true);
    mockPostFuelExpenseFromEvent
      .mockResolvedValueOnce({
        result: "posted",
        posting_batch_id: "batch-1",
        journal_entry_id: "je-1",
        journal_entry_posting_ids: ["jep-1"],
        idempotency_key: "k",
        account_resolution_trace: [],
      })
      .mockResolvedValueOnce({
        result: "already_posted",
        posting_batch_id: "batch-1",
        journal_entry_id: "je-1",
        journal_entry_posting_ids: ["jep-1"],
        idempotency_key: "k",
        account_resolution_trace: [],
      });

    const first = await maybePostFuelExpenseFromCanonicalTxn(BASE);
    const second = await maybePostFuelExpenseFromCanonicalTxn(BASE);
    expect(first.status).toBe("posted");
    expect(second.status).toBe("already_posted");
    expect(mockPostFuelExpenseFromEvent).toHaveBeenCalledTimes(2);
  });

  it("zero amount → skip without flag check posting", async () => {
    const result = await maybePostFuelExpenseFromCanonicalTxn({ ...BASE, amount_cents: 0 });
    expect(result).toEqual({ status: "skipped_zero_amount" });
    expect(mockPostFuelExpenseFromEvent).not.toHaveBeenCalled();
  });

  it("cash_advance + driver → driver_advance path", async () => {
    mockIsEnabled.mockResolvedValue(true);
    mockPostFuelExpenseFromEvent.mockResolvedValue({
      result: "posted",
      posting_batch_id: "batch-1",
      journal_entry_id: "je-1",
      journal_entry_posting_ids: ["jep-1"],
      idempotency_key: "k",
      account_resolution_trace: [],
    });
    await maybePostFuelExpenseFromCanonicalTxn({ ...BASE, cash_advance: true });
    expect(mockPostFuelExpenseFromEvent).toHaveBeenCalledWith(
      expect.objectContaining({ posting_path: "driver_advance" })
    );
  });
});

describe("flushFuelGlPostsAfterCommit", () => {
  beforeEach(() => {
    mockIsEnabled.mockReset();
    mockPostFuelExpenseFromEvent.mockReset();
  });

  it("counts flag-off skips and does not throw", async () => {
    mockIsEnabled.mockResolvedValue(false);
    const stats = await flushFuelGlPostsAfterCommit([BASE, BASE]);
    expect(stats).toEqual({ attempted: 2, posted: 0, skipped_flag_off: 2, errors: 0 });
    expect(mockPostFuelExpenseFromEvent).not.toHaveBeenCalled();
  });
});
