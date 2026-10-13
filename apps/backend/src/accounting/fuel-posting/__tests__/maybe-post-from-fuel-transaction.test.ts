import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  FUEL_EXPENSE_GL_POSTING_FLAG_KEY,
  FUEL_POSTS_ON_RECEIPT_FLAG_KEY,
  mapFuelTypeToPostingKind,
  maybePostFuelExpenseFromCanonicalTxn,
  flushFuelGlPostsAfterCommit,
  resolveCompanyDirectCreditPreference,
  type FuelTxnGlPostCandidate,
} from "../maybe-post-from-fuel-transaction.service.js";

const { mockIsEnabled, mockWithLuciaBypass, mockPostFuelExpenseFromEvent, mockPostOnReceipt } = vi.hoisted(() => {
  const query = vi.fn(async () => ({ rows: [] }));
  return {
    mockIsEnabled: vi.fn(),
    mockWithLuciaBypass: vi.fn(async (fn: (client: { query: typeof query }) => unknown) => fn({ query })),
    mockPostFuelExpenseFromEvent: vi.fn(),
    mockPostOnReceipt: vi.fn(),
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

// 443.116 #1 — the receipt post goes through the ONE fill poster (bank-match-fuel-post.service.ts).
vi.mock("../../bank-recon/bank-match-fuel-post.service.js", () => ({
  postFuelFillOnReceipt: mockPostOnReceipt,
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
  it("Relay settle (identified via relay_fuel_transaction_id) -> refused: the row links to its fill, never ap, never posts", () => {
    expect(() =>
      resolveCompanyDirectCreditPreference({
        ...BASE,
        relay_fuel_transaction_id: "66666666-6666-4666-8666-666666666666",
      })
    ).toThrow(/relay_fill_links_not_posts/);
  });
  it("fuel_card_code DREAMLINE/RELAY resolves the rail directly", () => {
    expect(resolveCompanyDirectCreditPreference(BASE, { fuel_card_code: "DREAMLINE" })).toBe("dreamline_card_payable");
    // ACCT-F403: a Relay-rail fuel row links to its Relay fill and posts nothing — refused by name.
    expect(() => resolveCompanyDirectCreditPreference(BASE, { fuel_card_code: "RELAY" })).toThrow(/relay_fill_links_not_posts/);
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

  // R-153.7 (owner-stated fact, 2026-09-25): "USMCA buys fuel on two providers only: Relay and
  // Dreamline... Dreamline-confirmed rows -> 2510; every other real USMCA fuel row -> Relay 1295.
  // No card statement is needed to pick the rail." This is USMCA-ONLY -- every other entity keeps
  // the pre-153.7 cash/fail-closed behavior (the "true cash" test above, on BASE's placeholder
  // company id, is unaffected).
  it("R-153.7 + ACCT-F403: USMCA with no card evidence is Relay — the row links to its Relay fill and posts nothing, never cash", () => {
    const usmca = { ...BASE, operating_company_id: "5c854333-6ea5-4faa-af31-67cb272fef80" };
    expect(() => resolveCompanyDirectCreditPreference(usmca)).toThrow(/relay_fill_links_not_posts/);
    expect(() => resolveCompanyDirectCreditPreference(usmca, { fuel_card_id: null, notes: null, source: "import" })).toThrow(
      /relay_fill_links_not_posts/
    );
    expect(() => resolveCompanyDirectCreditPreference({ ...usmca, company_direct_credit: "relay_fuel_wallet" })).toThrow(
      /relay_fill_links_not_posts/
    );
  });
  it("R-153.7: USMCA still resolves DREAMLINE when the card code says so -- the rule does not override real evidence", () => {
    const usmca = { ...BASE, operating_company_id: "5c854333-6ea5-4faa-af31-67cb272fef80" };
    expect(resolveCompanyDirectCreditPreference(usmca, { fuel_card_code: "DREAMLINE" })).toBe("dreamline_card_payable");
  });
  it("R-153.7: a non-USMCA company with the same no-evidence shape is untouched (still cash)", () => {
    expect(resolveCompanyDirectCreditPreference({ ...BASE, operating_company_id: "91e0bf0a-133f-4ce8-a734-2586cfa66d96" })).toBe(
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
    mockPostOnReceipt.mockReset();
  });
  const flags = (receipt: boolean, expense: boolean) =>
    mockIsEnabled.mockImplementation(async (_c: unknown, key: string) => (key === FUEL_POSTS_ON_RECEIPT_FLAG_KEY ? receipt : key === FUEL_EXPENSE_GL_POSTING_FLAG_KEY ? expense : false));
  const POSTED = { result: "posted", posting_batch_id: "b1", journal_entry_id: "je-1", journal_entry_posting_ids: ["p1", "p2"], idempotency_key: "k", account_resolution_trace: [] };

  it("flag keys: EXPENSE_GL_POSTING_ENABLED + the per-company FUEL_POSTS_ON_RECEIPT_ENABLED", () => {
    expect(FUEL_EXPENSE_GL_POSTING_FLAG_KEY).toBe("EXPENSE_GL_POSTING_ENABLED");
    expect(FUEL_POSTS_ON_RECEIPT_FLAG_KEY).toBe("FUEL_POSTS_ON_RECEIPT_ENABLED");
  });

  it("receipt flag OFF (default): the fill posts at bank match — nothing posts at import", async () => {
    flags(false, true);
    expect(await maybePostFuelExpenseFromCanonicalTxn(BASE)).toEqual({ status: "skipped_posts_on_bank_match" });
    expect(mockPostOnReceipt).not.toHaveBeenCalled();
    expect(mockPostFuelExpenseFromEvent).not.toHaveBeenCalled();
  });

  it("receipt flag ON but expense posting OFF: skipped_flag_off, nothing posts", async () => {
    flags(true, false);
    expect(await maybePostFuelExpenseFromCanonicalTxn(BASE)).toEqual({ status: "skipped_flag_off" });
    expect(mockPostOnReceipt).not.toHaveBeenCalled();
  });

  it("ON: a card fill posts through the one fill poster as kind fuel_transaction — never the retired postFuelExpenseFromEvent", async () => {
    flags(true, true);
    mockPostOnReceipt.mockResolvedValue(POSTED);
    expect(await maybePostFuelExpenseFromCanonicalTxn(BASE)).toEqual({ status: "posted", posting: POSTED });
    expect(mockPostOnReceipt).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ kind: "fuel_transaction", fill_id: BASE.fuel_transaction_id }));
    expect(mockPostFuelExpenseFromEvent).not.toHaveBeenCalled();
  });

  it("ON: a Relay fill posts as kind relay_fuel with the Relay fill id (the receipt), once", async () => {
    flags(true, true);
    mockPostOnReceipt.mockResolvedValue({ ...POSTED, result: "already_posted" });
    const relay = { ...BASE, relay_fuel_transaction_id: "66666666-6666-4666-8666-666666666666" };
    expect((await maybePostFuelExpenseFromCanonicalTxn(relay)).status).toBe("already_posted");
    expect(mockPostOnReceipt).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ kind: "relay_fuel", fill_id: relay.relay_fuel_transaction_id }));
  });

  it("a Relay cash advance is not a fill; a zero amount posts nothing", async () => {
    flags(true, true);
    expect(await maybePostFuelExpenseFromCanonicalTxn({ ...BASE, cash_advance: true })).toEqual({ status: "skipped_not_a_fill" });
    expect(await maybePostFuelExpenseFromCanonicalTxn({ ...BASE, amount_cents: 0 })).toEqual({ status: "skipped_zero_amount" });
    expect(mockPostOnReceipt).not.toHaveBeenCalled();
  });

  it("a fill the poster refuses by name (no load at fill time) stays unposted for its bank match — not an error", async () => {
    flags(true, true);
    const err = Object.assign(new Error("fuel_transaction x: load_id is null"), { name: "FuelMatchPostError" });
    mockPostOnReceipt.mockRejectedValue(err);
    expect(await maybePostFuelExpenseFromCanonicalTxn(BASE)).toEqual({ status: "unposted_at_receipt", message: err.message });
  });
});

describe("flushFuelGlPostsAfterCommit", () => {
  beforeEach(() => {
    mockIsEnabled.mockReset();
    mockPostFuelExpenseFromEvent.mockReset();
    mockPostOnReceipt.mockReset();
  });

  it("receipt flag OFF: counts every candidate as posting on bank match, never posts, does not throw", async () => {
    mockIsEnabled.mockResolvedValue(false);
    const stats = await flushFuelGlPostsAfterCommit([BASE, BASE]);
    expect(stats).toEqual({ attempted: 2, posted: 0, skipped_flag_off: 0, skipped_posts_on_bank_match: 2, unposted_at_receipt: 0, errors: 0 });
    expect(mockPostOnReceipt).not.toHaveBeenCalled();
  });

  it("receipt flag ON: posts each fill once through the one fill poster", async () => {
    mockIsEnabled.mockResolvedValue(true);
    mockPostOnReceipt.mockResolvedValue({ result: "posted", posting_batch_id: "b", journal_entry_id: "je", journal_entry_posting_ids: [], idempotency_key: "k", account_resolution_trace: [] });
    const stats = await flushFuelGlPostsAfterCommit([BASE]);
    expect(stats).toEqual({ attempted: 1, posted: 1, skipped_flag_off: 0, skipped_posts_on_bank_match: 0, unposted_at_receipt: 0, errors: 0 });
  });
});
