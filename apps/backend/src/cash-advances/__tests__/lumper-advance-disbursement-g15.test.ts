/**
 * LEAD 443.184 G15 — fail-old: a lumper advance could be disbursed with NO expense — the core disburse returned early
 * with GL posting off (silent skip), and PATCH mark-disbursed only flipped the status — and the create path still
 * labelled it "expense posting HOLD". Now every disburse path posts it as the load's lumper expense, or refuses.
 */
import { describe, expect, it, vi } from "vitest";

const { mockQuery, mockPost, mockIsEnabled } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockPost: vi.fn(),
  mockIsEnabled: vi.fn(),
}));
vi.mock("../../auth/db.js", async (orig) => ({ ...((await orig()) as object), withCurrentUser: async (_u: string, fn: (c: unknown) => unknown) => fn({ query: mockQuery }) }));
vi.mock("../../accounting/posting-engine.service.js", () => ({ postSourceTransactionInClientTx: mockPost }));
vi.mock("../../accounting/bills.service.js", () => ({ updateBankBalance: vi.fn() }));
vi.mock("../../audit/crud-audit.js", () => ({ appendCrudAudit: vi.fn() }));
vi.mock("../../lib/feature-flags/service.js", () => ({ isEnabled: mockIsEnabled }));
vi.mock("../../bulk/bulk-update.factory.js", () => ({ isOwnerOrAdmin: () => true }));

const { disburseDriverAdvanceCore } = await import("../cash-advance-disburse.js");
const { postLumperAdvanceAtDisbursementInClientTx } = await import("../lumper-advance-expense.service.js");

const OPCO = "11111111-1111-4111-8111-111111111111";
const ADV = "44444444-4444-4444-8444-444444444444";

describe("443.184 G15 — a lumper advance is never disbursed without its expense", () => {
  it("core disburse refuses a lumper advance when GL posting is off — before anything is written", async () => {
    mockQuery.mockReset();
    mockPost.mockReset();
    mockIsEnabled.mockReset().mockResolvedValue(false);
    const sql: string[] = [];
    mockQuery.mockImplementation(async (s: string) => {
      sql.push(s);
      if (s.includes("SELECT") && s.includes("driver_advances")) return { rows: [{ id: ADV, disbursement_status: "approved", posting_date: null, amount: "150.00", from_bank_account_id: null, purpose: "lumper" }] };
      return { rows: [] };
    });
    const r = await disburseDriverAdvanceCore("actor", "Owner", OPCO, { advance_id: ADV });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("lumper_advance_requires_gl_posting");
    expect(sql.some((s) => /UPDATE driver_finance\.driver_advances/.test(s))).toBe(false);
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("the disbursement helper posts the advance's own entry when it has none live, then records the lumper expense", async () => {
    mockPost.mockReset().mockResolvedValue({ result: "posted" });
    const seen: string[] = [];
    const client = { query: vi.fn(async (s: string) => { seen.push(s); return { rows: [] }; }) };
    const r = await postLumperAdvanceAtDisbursementInClientTx(client, { operatingCompanyId: OPCO, advanceId: ADV, actorUserId: "actor" });
    expect(mockPost).toHaveBeenCalledWith(client, expect.objectContaining({ source_transaction_type: "driver_advance", source_transaction_id: ADV }), { userId: "actor" });
    // then the ONE lumper expense writer runs (it reads the advance first; an empty fixture reads as not a lumper)
    expect(seen.some((s) => /FROM driver_finance\.driver_advances a WHERE a\.id = \$1::uuid/.test(s))).toBe(true);
    expect(r).toMatchObject({ recorded: false, reason: "not_a_lumper" });
  });

  it("an advance already posted is not posted twice", async () => {
    mockPost.mockReset();
    const client = { query: vi.fn(async (s: string) => ({ rows: /journal_entry_postings/.test(s) ? [{ one: 1 }] : [] })) };
    await postLumperAdvanceAtDisbursementInClientTx(client, { operatingCompanyId: OPCO, advanceId: ADV, actorUserId: "actor" });
    expect(mockPost).not.toHaveBeenCalled();
  });
});
