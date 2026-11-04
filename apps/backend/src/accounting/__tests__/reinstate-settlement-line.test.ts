/**
 * ACCT-F11098 — reinstateDocument(type settlement_line). The SET-24 LINE-DUP sweep voided real per-load escrow lines
 * ($25.00 each, different loads) whose dollars the posted header and escrow ledger still carried. The engine reinstates
 * them without posting, and refuses a true duplicate (active twin on the SAME load), a line the posted header never
 * carried, and an escrow line the escrow ledger never carried.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../void-document-stamp.service.js", () => ({
  stampDocumentReinstated: vi.fn(async (_client: unknown, params: { family: string; documentId: string }) => ({
    family: params.family,
    document_id: params.documentId,
    reinstated_at: "2026-11-04T15:00:00.000Z",
    reinstate_reason: "test",
    reinstated_by_user_id: "actor-1",
  })),
  VoidDocumentStampError: class extends Error {
    constructor(public code: string, message: string) {
      super(message);
    }
  },
}));
vi.mock("../../audit/crud-audit.js", () => ({ appendCrudAudit: vi.fn(async () => undefined) }));
vi.mock("../bills.service.js", () => ({ updateBankBalance: vi.fn(async () => undefined) }));
vi.mock("../journal-entries.service.js", () => ({
  restoreReversedJournalEntry: vi.fn(async () => ({ restore_journal_entry_id: "x" })),
}));

import { reinstateDocument } from "../reinstate-document.service.js";
import { stampDocumentReinstated } from "../void-document-stamp.service.js";
import { appendCrudAudit } from "../../audit/crud-audit.js";
import { restoreReversedJournalEntry } from "../journal-entries.service.js";

const OPCO = "5c854333-6ea5-4faa-af31-67cb272fef80";
const base = { operatingCompanyId: OPCO, reason: "ACCT-F11098 test", actor: { userId: "e4117991-d2c0-406d-8cda-74e98d95bccd" } };

type Line = Record<string, unknown>;
const escrowLine = (over: Line = {}): Line => ({
  id: "sl-1",
  settlement_id: "st-1",
  line_type: "escrow_contribution",
  description: "Driver-Escrow For Claims",
  amount_cents: "2500",
  load_id: "load-B",
  is_active: false,
  voided_at: "2026-10-24T20:55:00Z",
  void_reason: "SET-24 LINE-DUP: exact duplicate ...",
  void_reversal_entry_id: null,
  settlement_status: "closed",
  settlement_voided_at: null,
  gross_cents: "190000",
  deductions_cents: "5000",
  reimbursements_cents: "0",
  active_twins: "0",
  ...over,
});

function client(line: Line | null, bucketActiveCents: number, escrow: { posted: number; active: number; split: number }) {
  return {
    query: vi.fn(async (sql: string) => {
      if (sql.includes("LEFT JOIN driver_finance.driver_settlements ds")) return { rows: line ? [line] : [] };
      if (sql.includes("line_type = ANY($3::text[])")) return { rows: [{ active_cents: String(bucketActiveCents) }] };
      if (sql.includes("posted_cents")) {
        return { rows: [{ posted_cents: String(escrow.posted), active_cents: String(escrow.active), split_rows: String(escrow.split) }] };
      }
      return { rows: [] };
    }),
  } as never;
}

describe("reinstateDocument — settlement_line (ACCT-F11098)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reinstates a real per-load escrow line the header + escrow ledger already carry, and posts nothing", async () => {
    // Header deductions $50.00; active lines $25.00 (load A); this line $25.00 (load B). Escrow posted $50.00, split row present.
    const c = client(escrowLine(), 2500, { posted: 5000, active: 2500, split: 1 });
    const res = await reinstateDocument(c, { ...base, type: "settlement_line", id: "sl-1" });
    expect(res.reinstatedFromVoidJeId).toBeNull();
    expect(stampDocumentReinstated).toHaveBeenCalledWith(
      c,
      expect.objectContaining({ family: "settlement_line", documentId: "sl-1", restoreStatus: null, reinstatedFromVoidJeId: null })
    );
    expect(appendCrudAudit).toHaveBeenCalledWith(
      c,
      base.actor.userId,
      "driver_finance.settlement_line.reinstated",
      expect.objectContaining({
        gl_posted: false,
        evidence: expect.objectContaining({ load_id: "load-B", escrow_posted_cents: 5000, escrow_active_lines_cents_before: 2500, prior_void_reason: expect.stringContaining("SET-24 LINE-DUP") }),
      }),
      "warning",
      "R-191-UNIVERSAL-UNVOID"
    );
    expect(restoreReversedJournalEntry).not.toHaveBeenCalled();
  });

  it("refuses a TRUE duplicate: an active twin on the same load stays void", async () => {
    const c = client(escrowLine({ active_twins: "1" }), 2500, { posted: 5000, active: 2500, split: 1 });
    await expect(reinstateDocument(c, { ...base, type: "settlement_line", id: "sl-1" })).rejects.toMatchObject({ code: "settlement_line_true_duplicate" });
    expect(stampDocumentReinstated).not.toHaveBeenCalled();
  });

  it("refuses when the posted header never carried the line (would double count / show unbooked money)", async () => {
    const c = client(escrowLine(), 5000, { posted: 7500, active: 5000, split: 1 });
    await expect(reinstateDocument(c, { ...base, type: "settlement_line", id: "sl-1" })).rejects.toMatchObject({ code: "reinstate_exceeds_posted_header" });
  });

  it("refuses an escrow line the escrow ledger never carried (posted total or per-load split missing)", async () => {
    const over = client(escrowLine(), 2500, { posted: 2500, active: 2500, split: 1 });
    await expect(reinstateDocument(over, { ...base, type: "settlement_line", id: "sl-1" })).rejects.toMatchObject({ code: "escrow_not_posted_for_line" });
    const noSplit = client(escrowLine(), 2500, { posted: 5000, active: 2500, split: 0 });
    await expect(reinstateDocument(noSplit, { ...base, type: "settlement_line", id: "sl-1" })).rejects.toMatchObject({ code: "escrow_not_posted_for_line" });
  });

  it("refuses a live line, a line on a voided settlement, and a type outside the posted buckets", async () => {
    await expect(
      reinstateDocument(client(escrowLine({ is_active: true, voided_at: null }), 0, { posted: 0, active: 0, split: 0 }), { ...base, type: "settlement_line", id: "sl-1" })
    ).rejects.toMatchObject({ code: "settlement_line_not_void" });
    await expect(
      reinstateDocument(client(escrowLine({ settlement_voided_at: "2026-10-01" }), 0, { posted: 0, active: 0, split: 0 }), { ...base, type: "settlement_line", id: "sl-1" })
    ).rejects.toMatchObject({ code: "parent_settlement_void" });
    await expect(
      reinstateDocument(client(escrowLine({ line_type: "advance_recovery" }), 0, { posted: 0, active: 0, split: 0 }), { ...base, type: "settlement_line", id: "sl-1" })
    ).rejects.toMatchObject({ code: "settlement_line_type_not_reinstatable" });
  });

  it("a void that reversed GL fails closed unless the GL restore follows in the same chain", async () => {
    const c = client(escrowLine({ void_reversal_entry_id: "je-rev" }), 2500, { posted: 5000, active: 2500, split: 1 });
    await expect(reinstateDocument(c, { ...base, type: "settlement_line", id: "sl-1" })).rejects.toMatchObject({ name: "ReinstateGlNotRestoredError" });
  });

  it("pre-close settlement: no posted totals to prove against — reinstates (the close will post it)", async () => {
    const c = client(escrowLine({ settlement_status: "open" }), 0, { posted: 0, active: 0, split: 0 });
    await expect(reinstateDocument(c, { ...base, type: "settlement_line", id: "sl-1" })).resolves.toBeTruthy();
  });
});
