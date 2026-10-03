import { beforeEach, describe, expect, it, vi } from "vitest";

// ROUND 360 — the bank-line state machine decides Undo by HOW the line left For review (resolution_kind).
// Spec: docs/bus/00-CONTRACT-BANK-FEED-STATE-MACHINE-MATCH-UNMATCH-CATEGORIZE-UNDO.md. The live proof (balances at every
// step, trial balance unchanged across match + unmatch, all five document types) is the fork finish test in the PR;
// these pin the branch decisions so a refactor cannot quietly make UNMATCH destroy a document or UNDO leave one behind.

const voidDocument = vi.fn(async () => ({ ok: true }));
const reverseJournalEntryNoFlip = vi.fn(async () => ({ id: "rev-je" }));
const unmatchBankTransactionOnClient = vi.fn(async () => ({ released: [{ kind: "expense", id: "exp-1" }], reversed_match_journal_entry_id: null }));
const revokeTransferInClient = vi.fn(async () => ({ released_bank_transaction_ids: ["line-1", "line-2"] }));

vi.mock("../../accounting/void-document.service.js", () => ({ voidDocument }));
vi.mock("../../accounting/journal-entries.service.js", () => ({ reverseJournalEntryNoFlip }));
vi.mock("../../accounting/posting-engine.service.js", () => ({ POSTING_ENGINE_SUPPORTS_REPOST: true }));
vi.mock("../../accounting/bank-recon/recon-worklist.service.js", () => ({ unmatchBankTransactionOnClient }));
vi.mock("../../lib/feature-flags/service.js", () => ({ isEnabled: vi.fn(async () => true) }));
vi.mock("../../audit/crud-audit.js", () => ({ appendCrudAudit: vi.fn(async () => undefined) }));
vi.mock("../closed-session-immutability.js", () => ({ assertBankTxnNotInReconciledSession: vi.fn(async () => undefined) }));
vi.mock("../transfers.service.js", () => ({ RELEASE_TRANSFER_LINK_SET_SQL: "status = 'pending_categorization'", revokeTransferInClient }));

const { undoBankLineOnClient } = await import("../bank-line-state-machine.service.js");

const CO = "11111111-1111-4111-8111-111111111111";
const ACTOR = "22222222-2222-4222-8222-222222222222";

type Line = { review_bucket: string; resolution_kind: string | null; matched_journal_entry_id?: string | null; matched_transfer_id?: string | null };

/** A client whose line starts as `line` and lands in `after` (For review unless a test says otherwise). */
function client(line: Line, opts: { after?: { review_bucket: string; resolution_kind: string | null }; je?: { status: string; reversed_by_je_id: string | null } | null; created?: Array<{ type: string; id: string }>; transfer?: { id: string; revoked_at: string | null; minted_from_bank_transaction_id: string | null } } = {}) {
  const sql: string[] = [];
  const q = vi.fn(async (text: string) => {
    sql.push(text);
    if (/SELECT id::text, review_bucket, resolution_kind/.test(text)) return { rows: [{ id: "line-1", voided_at: null, matched_journal_entry_id: null, matched_transfer_id: null, ...line }] };
    if (/SELECT review_bucket, resolution_kind FROM banking\.bank_transactions/.test(text)) return { rows: [opts.after ?? { review_bucket: "for_review", resolution_kind: null }] };
    if (/FROM accounting\.journal_entries\s+WHERE id = \$1::uuid/.test(text)) return { rows: opts.je === null ? [] : [opts.je ?? { status: "posted", reversed_by_je_id: null }] };
    if (/'bill_payment'::text AS type/.test(text)) return { rows: opts.created ?? [] };
    if (/FROM banking\.transfers/.test(text)) return { rows: opts.transfer ? [opts.transfer] : [] };
    return { rows: [] };
  });
  return { c: { query: q } as never, sql };
}

const run = (c: never) => undoBankLineOnClient(c, { operatingCompanyId: CO, bankTransactionId: "line-1", actorUserId: ACTOR });

beforeEach(() => vi.clearAllMocks());

describe("bank-line state machine — UNDO by resolution_kind", () => {
  it("UNMATCH (kind matched) breaks the link only: never voids, never reverses the matched document", async () => {
    const { c } = client({ review_bucket: "categorized", resolution_kind: "matched", matched_journal_entry_id: null });
    const out = await run(c);
    expect(unmatchBankTransactionOnClient).toHaveBeenCalledTimes(1);
    expect(voidDocument).not.toHaveBeenCalled();
    expect(revokeTransferInClient).not.toHaveBeenCalled();
    expect(out.released_documents).toEqual([{ kind: "expense", id: "exp-1" }]);
    expect(out.voided_documents).toEqual([]);
  });

  it("UNDO of a categorize (kind added) reverses the entry it posted and voids the documents it created", async () => {
    const { c } = client(
      { review_bucket: "categorized", resolution_kind: "added", matched_journal_entry_id: "je-1" },
      { created: [{ type: "bill_payment", id: "bp-1" }, { type: "bill", id: "b-1" }] }
    );
    const out = await run(c);
    expect(reverseJournalEntryNoFlip).toHaveBeenCalledTimes(1);
    expect(out.reversed_journal_entry_ids).toEqual(["je-1"]);
    expect(voidDocument.mock.calls.map((x) => (x as unknown[])[1])).toMatchObject([{ type: "bill_payment", id: "bp-1" }, { type: "bill", id: "b-1" }]);
    expect(unmatchBankTransactionOnClient).not.toHaveBeenCalled();
  });

  it("NEVER A DOUBLE REVERSAL: an entry already reversed is a GL no-op, the link is still cleared", async () => {
    const { c, sql } = client({ review_bucket: "categorized", resolution_kind: "added", matched_journal_entry_id: "je-1" }, { je: { status: "posted", reversed_by_je_id: "je-0" } });
    const out = await run(c);
    expect(reverseJournalEntryNoFlip).not.toHaveBeenCalled();
    expect(out.already_reversed_journal_entry_ids).toEqual(["je-1"]);
    expect(sql.some((s) => /matched_journal_entry_id = NULL/.test(s))).toBe(true);
  });

  it("a transfer this line MINTED is revoked; a pre-existing transfer is only unlinked", async () => {
    const minted = client({ review_bucket: "categorized", resolution_kind: "transfer", matched_transfer_id: "t-1" }, { transfer: { id: "t-1", revoked_at: null, minted_from_bank_transaction_id: "line-1" } });
    expect((await run(minted.c)).revoked_transfer_id).toBe("t-1");
    vi.clearAllMocks();
    const existing = client({ review_bucket: "categorized", resolution_kind: "transfer", matched_transfer_id: "t-2" }, { transfer: { id: "t-2", revoked_at: null, minted_from_bank_transaction_id: null } });
    const out = await run(existing.c);
    expect(revokeTransferInClient).not.toHaveBeenCalled();
    expect(out.revoked_transfer_id).toBeNull();
    expect(out.released_documents).toEqual([{ kind: "transfer", id: "t-2" }]);
  });

  it("UNDO of an exclude clears the exclusion and touches no document or entry", async () => {
    const { c, sql } = client({ review_bucket: "excluded", resolution_kind: null });
    await run(c);
    expect(sql.some((s) => /SET excluded_reason = NULL/.test(s))).toBe(true);
    expect(voidDocument).not.toHaveBeenCalled();
    expect(reverseJournalEntryNoFlip).not.toHaveBeenCalled();
  });

  it("a line already in For review is a no-op", async () => {
    const { c } = client({ review_bucket: "for_review", resolution_kind: null });
    expect((await run(c)).noop).toBe(true);
    expect(unmatchBankTransactionOnClient).not.toHaveBeenCalled();
  });

  it("NO STRANDING: if the line did not land in For review the undo throws, so the caller's transaction rolls back", async () => {
    const { c } = client({ review_bucket: "categorized", resolution_kind: "matched" }, { after: { review_bucket: "categorized", resolution_kind: "matched" } });
    await expect(run(c)).rejects.toThrow("bank_line_undo_left_line_in_categorized");
  });
});
