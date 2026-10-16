// LEAD 443.171 E — editPurchase refusals (the happy path — date 09-04 -> 09-05, remove a line, partial, undo; TB 0, 2150
// ties, same FP id — is proven end to end on a Neon fork of prod: ~/IH35-LEAD-CHANNEL/2026-10-16-CC2-443171-E-fork-rehearsal.txt).
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockReverse, mockPost } = vi.hoisted(() => ({
  mockReverse: vi.fn(async () => ({ reversed: true, reversal_journal_entry_id: "je-rev", original_journal_entry_id: "je-fund", all_reversed: [] })),
  mockPost: vi.fn(async () => ({ posted: true, journal_entry_id: "je-new" })),
}));
vi.mock("../owner-only-purchase.js", () => ({ checkFactoringPurchaseOwner: vi.fn(async () => true) }));
vi.mock("../../accounting/factoring-posting/poster.service.js", () => ({
  postFactoringAdvanceEventInClientTx: mockPost,
  reverseFactoringAdvanceEventInClientTx: mockReverse,
}));
vi.mock("../../accounting/factoring-posting/lifecycle-repair.js", () => ({
  findAllLifecyclePostingKeyJes: vi.fn(async () => [{ source_transaction_type: "factoring_advance", event_key: "funding", journal_entry_id: "je-fund" }]),
}));
vi.mock("../../accounting/posting-engine.service.js", () => ({ ensureOpenPeriod: vi.fn(async () => undefined) }));
vi.mock("../purchased-gross.service.js", () => ({ unrelievedPurchasedGrossCents: vi.fn(async () => 300000) }));
vi.mock("../factor.service.js", () => ({
  resolvePurchaseRate: vi.fn(async () => ({ factor_id: "f-1", factor_name: "Faro", reserve: 0.015, cash: 0, fee: 0.015, source: "customer_assignment", reason: null })),
}));
vi.mock("../factoring-spine-links.js", () => ({ writeDocumentSpineLinks: vi.fn(async () => 0) }));
vi.mock("../../audit/crud-audit.js", () => ({ appendCrudAudit: vi.fn(async () => undefined) }));

const { editPurchase } = await import("../purchase.service.js");
const OCI = "5c854333-6ea5-4faa-af31-67cb272fef80";
const line = { id: "pl-1", line_no: 1, invoice_id: "inv-1", gross_cents: "300000", escrow_reserve_cents: "4500", cash_reserve_cents: "0", fee_cents: "4500", faro_invoice_number: null };
const makeClient = (o: { status?: string; matched?: boolean; advStatus?: string } = {}) => ({
  query: vi.fn(async (sql: string) => {
    if (sql.includes("SELECT * FROM accounting.factoring_purchases")) {
      return { rows: [{ id: "p-1", display_id: "FP-2026-00025", status: o.status ?? "posted", factoring_advance_id: "adv-1", purchase_date: "2026-09-04",
        wire_fee_cents: "0", net_to_company_cents: "291000", gross_cents: "300000", escrow_reserve_cents: "4500", cash_reserve_cents: "0", fee_cents: "4500" }] };
    }
    if (sql.includes("FROM accounting.factoring_advances WHERE id")) return { rows: [{ status: o.advStatus ?? "advanced" }] };
    if (sql.includes("FROM accounting.factoring_purchase_lines WHERE purchase_id") && sql.includes("ORDER BY line_no")) return { rows: [line] };
    if (sql.includes("AS pledge_cents")) return { rows: [{ id: "inv-1", customer_id: "c-1", load_id: "l-1", status: "sent", factoring_status: "advanced", pledge_cents: "400000", settlement_id: null, on_purchase: false }] };
    if (sql.trim().startsWith("SELECT id::text FROM banking.bank_transactions")) return { rows: o.matched ? [{ id: "bt-1" }] : [] };
    if (sql.includes("MAX(line_no)")) return { rows: [{ n: 1 }] };
    if (sql.includes("FROM accounting.factoring_purchases")) return { rows: [{ id: "p-1", display_id: "FP-2026-00025", status: "posted" }] };
    return { rows: [], rowCount: 1 };
  }),
});
const input = { operatingCompanyId: OCI, actorUserId: "owner", purchaseId: "p-1", reason: "wrong purchase date entered", purchaseDate: "2026-09-05",
  lines: [{ invoice_id: "inv-1", gross_cents: 300000, escrow_reserve_cents: 4500, cash_reserve_cents: 0, fee_cents: 4500, faro_invoice_number: null }] };

describe("443.171 E — editPurchase", () => {
  beforeEach(() => { mockReverse.mockClear(); mockPost.mockClear(); });

  it("a date-only edit reverses and re-posts the SAME advance dated the new purchase date", async () => {
    await editPurchase(makeClient() as never, input);
    expect(mockReverse).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ factoring_advance_id: "adv-1", keep_deposit_sweep: false }));
    expect(mockPost).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ factoring_advance_id: "adv-1", advanced_at_iso: "2026-09-05" }));
  });

  it("a matched wire allows a date-only edit (net unchanged) and keeps the deposit sweep", async () => {
    await editPurchase(makeClient({ matched: true }) as never, input);
    expect(mockReverse).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ keep_deposit_sweep: true }));
  });

  it("a matched wire refuses an amount change — unmatch first; nothing is reversed", async () => {
    await expect(editPurchase(makeClient({ matched: true }) as never, { ...input, lines: [{ ...input.lines[0]!, gross_cents: 250000, escrow_reserve_cents: 3750, fee_cents: 3750 }] }))
      .rejects.toMatchObject({ code: "factoring_purchase_matched_to_bank_unmatch_first", details: { bank_transaction_id: "bt-1" } });
    expect(mockReverse).not.toHaveBeenCalled();
  });

  it("refuses a draft / voided purchase, an advance with later events, a short reason, and gross above open", async () => {
    await expect(editPurchase(makeClient({ status: "voided" }) as never, input)).rejects.toMatchObject({ code: "factoring_purchase_not_posted:voided" });
    await expect(editPurchase(makeClient({ advStatus: "collected" }) as never, input)).rejects.toMatchObject({ code: "factoring_purchase_has_later_events:collected" });
    await expect(editPurchase(makeClient() as never, { ...input, reason: "short" })).rejects.toMatchObject({ code: "purchase_edit_reason_required" });
    await expect(editPurchase(makeClient() as never, { ...input, lines: [{ invoice_id: "inv-1", gross_cents: 400001 }] })).rejects.toMatchObject({ code: "purchase_line_gross_exceeds_open" });
    expect(mockReverse).not.toHaveBeenCalled();
  });
});
