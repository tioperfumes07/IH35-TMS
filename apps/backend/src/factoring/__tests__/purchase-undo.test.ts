// LEAD 443.171 A — Undo purchase. The UI calls the existing voidPurchase; this pins what the owner sees after it: the
// purchase reads voided, the funding legs (and any later legs) are reversed through the ONE canonical reversal, the
// invoices go back to not_factored on Submit to Factor, and a purchase whose wire is matched in Banking is refused by name.
// Partial-purchase legs (3,000 of 4,000, 1.5% / 1.5%): CR 2150 3,000 / DR clearing 2,910 + DR escrow 45 + DR fee 45 —
// the reversal mirrors every leg, so each account nets to 0.
import { beforeEach, describe, expect, it, vi } from "vitest";

const FUNDING = [
  { account: "2150", dc: "credit", amount: 300000 },
  { account: "1090", dc: "debit", amount: 291000 },
  { account: "1230", dc: "debit", amount: 4500 },
  { account: "6400", dc: "debit", amount: 4500 },
] as const;
const { mockReverse, mockStamp } = vi.hoisted(() => ({
  mockReverse: vi.fn(async () => ({ reversed: true, reversal_journal_entry_id: "je-rev", original_journal_entry_id: "je-fund", all_reversed: [] })),
  mockStamp: vi.fn(async () => undefined),
}));
vi.mock("../owner-only-purchase.js", () => ({ checkFactoringPurchaseOwner: vi.fn(async () => true) }));
vi.mock("../../accounting/factoring-posting/poster.service.js", () => ({
  postFactoringAdvanceEventInClientTx: vi.fn(),
  reverseFactoringAdvanceEventInClientTx: mockReverse,
}));
vi.mock("../../accounting/void-document-stamp.service.js", () => ({ stampDocumentVoided: mockStamp }));
vi.mock("../../audit/crud-audit.js", () => ({ appendCrudAudit: vi.fn(async () => undefined) }));

const { voidPurchase } = await import("../purchase.service.js");

const OCI = "5c854333-6ea5-4faa-af31-67cb272fef80";
const calls: Array<{ sql: string; values?: unknown[] }> = [];
const makeClient = (opts: { matched: boolean }) => ({
  query: vi.fn(async (sql: string, values?: unknown[]) => {
    calls.push({ sql, values });
    if (sql.includes("FROM banking.bank_transactions WHERE matched_factoring_advance_id")) return { rows: opts.matched ? [{ "?column?": 1 }] : [] };
    if (sql.includes("FROM accounting.factoring_advances WHERE id")) return { rows: [{ status: "advanced" }] };
    if (sql.includes("SELECT * FROM accounting.factoring_purchases")) return { rows: [{ id: "p-1", display_id: "FP-2026-09999", status: "posted", factoring_advance_id: "adv-1" }] };
    if (sql.includes("FROM accounting.factoring_purchases")) return { rows: [{ id: "p-1", display_id: "FP-2026-09999", status: "voided" }] };
    return { rows: [], rowCount: 1 };
  }),
});
const input = { operatingCompanyId: OCI, actorUserId: "owner", purchaseId: "p-1", reason: "Faro bought 3,000 not 4,000 — redo" };

describe("443.171 A — undo purchase", () => {
  beforeEach(() => { calls.length = 0; mockReverse.mockClear(); mockStamp.mockClear(); });

  it("reverses through the canonical reversal, voids the advance, puts the invoices back to not_factored, voids head + lines", async () => {
    await voidPurchase(makeClient({ matched: false }) as never, input);
    expect(mockReverse).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ factoring_advance_id: "adv-1", reason: input.reason }));
    expect(mockStamp).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ family: "factoring_advance", documentId: "adv-1" }));
    const unlink = calls.find((c) => c.sql.includes("SET factoring_status = 'not_factored'"));
    expect(unlink?.values?.[0]).toBe("adv-1");
    expect(unlink?.sql).toContain("factoring_advance_id = NULL");
    const head = calls.findIndex((c) => c.sql.includes("UPDATE accounting.factoring_purchases SET status = 'voided'"));
    const lines = calls.findIndex((c) => c.sql.includes("UPDATE accounting.factoring_purchase_lines SET voided_at"));
    expect(head).toBeGreaterThan(-1);
    expect(lines).toBeGreaterThan(head); // header first: the posted-lines freeze only releases once the head is not 'posted'
  });

  it("a purchase whose Faro wire is matched in Banking is refused — unmatch first; nothing is reversed", async () => {
    await expect(voidPurchase(makeClient({ matched: true }) as never, input)).rejects.toMatchObject({ code: "factoring_purchase_matched_to_bank_unmatch_first", statusCode: 409 });
    expect(mockReverse).not.toHaveBeenCalled();
    expect(calls.some((c) => c.sql.includes("not_factored"))).toBe(false);
  });

  it("the mirror of the 3,000 partial funding legs nets every account to 0 (and the funding JE balances)", () => {
    const signed = (l: { dc: string; amount: number }) => (l.dc === "debit" ? l.amount : -l.amount);
    expect(FUNDING.reduce((t, l) => t + signed(l), 0)).toBe(0);
    const mirror = FUNDING.map((l) => ({ ...l, dc: l.dc === "debit" ? "credit" : "debit" }));
    const net = new Map<string, number>();
    for (const l of [...FUNDING, ...mirror]) net.set(l.account, (net.get(l.account) ?? 0) + signed(l));
    expect([...net.values()].every((v) => v === 0)).toBe(true);
  });
});
