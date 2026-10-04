/**
 * reinstateDocument — ROUND 191 unit tests.
 * Mocks stampDocumentReinstated + find paths; asserts dispatcher coverage mirrors voidDocument types
 * that are wired, refuses a factoring_advance reinstate that would double-count a live twin (ROUND 292), and refuses
 * 'deduction' as not yet wired. (Factoring / settlement / liability reinstates were wired by ROUND 285.2.1-R; the
 * per-record AUTH is the calling ops script's duty, enforced by verify-ops-scripts-assert-not-production.)
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../void-document-stamp.service.js", () => ({
  stampDocumentReinstated: vi.fn(async (_client: unknown, params: { family: string }) => ({
    family: params.family,
    document_id: "doc-1",
    reinstated_at: "2026-09-28T12:00:00.000Z",
    reinstate_reason: "test",
    reinstated_by_user_id: "actor-1",
  })),
  VoidDocumentStampError: class extends Error {
    constructor(public code: string, message: string) {
      super(message);
      this.name = "VoidDocumentStampError";
    }
  },
}));

vi.mock("../../audit/crud-audit.js", () => ({
  appendCrudAudit: vi.fn(async () => undefined),
}));

vi.mock("../bills.service.js", () => ({
  updateBankBalance: vi.fn(async () => undefined),
}));

vi.mock("../journal-entries.service.js", () => ({
  voidJournalEntry: vi.fn(async () => ({ reversal_journal_entry_id: null })),
  // ROUND 390.1 — reinstate restores GL through restoreReversedJournalEntry (a reversal is terminal).
  restoreReversedJournalEntry: vi.fn(async () => ({ restore_journal_entry_id: "restore-je", restore_date: "2026-10-04", already_restored: false })),
}));

import { FactoringTwinExistsError, reinstateDocument, ReinstateDocumentError } from "../reinstate-document.service.js";
import { stampDocumentReinstated } from "../void-document-stamp.service.js";

const OPCO = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ACTOR = "e4117991-d2c0-406d-8cda-74e98d95bccd";

function makeClient(rowsByNeedle: Array<{ needle: string; rows: unknown[] }>) {
  return {
    query: vi.fn(async (sql: string) => {
      for (const entry of rowsByNeedle) {
        if (sql.includes(entry.needle)) return { rows: entry.rows };
      }
      if (sql.trim().startsWith("UPDATE")) return { rows: [{ reinstated_at: "2026-09-28T12:00:00.000Z" }] };
      return { rows: [] };
    }),
  } as never;
}

const base = {
  operatingCompanyId: OPCO,
  reason: "R-191 unit reinstate",
  actor: { userId: ACTOR, role: "Owner" },
};

describe("reinstateDocument — R-191 universal unvoid", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("factoring_advance: refuses when a live twin would double-count (ROUND 292); reinstates when there is none", async () => {
    const twin = makeClient([{ needle: "FROM accounting.factoring_advances target", rows: [{ id: "fa-twin", display_id: "FAC-0001", matched_on: "faro_invoice_number" }] }]);
    await expect(reinstateDocument(twin, { ...base, type: "factoring_advance", id: "fa-1" })).rejects.toBeInstanceOf(FactoringTwinExistsError);
    await expect(reinstateDocument(makeClient([]), { ...base, type: "factoring_advance", id: "fa-1" })).resolves.toBeTruthy();
  });

  it("refuses deduction as not_yet_wired; settlement and liability are wired (ROUND 285.2.1-R)", async () => {
    const client = makeClient([]);
    await expect(reinstateDocument(client, { ...base, type: "deduction", id: "x-1" })).rejects.toMatchObject({ code: "not_yet_wired" });
    for (const type of ["settlement", "liability"] as const) {
      await expect(reinstateDocument(client, { ...base, type, id: "x-1" })).resolves.toBeTruthy();
    }
  });

  it("expense → stamps reinstate via stampDocumentReinstated(family=expense)", async () => {
    const client = makeClient([
      {
        needle: "FROM accounting.expenses",
        rows: [
          {
            id: "exp-1",
            status: "void",
            voided_at: "2026-09-28T00:00:00Z",
            posting_status: "reversed",
            reversed_by_je_id: "je-rev-1",
            journal_entry_id: "je-orig-1",
          },
        ],
      },
    ]);
    const result = await reinstateDocument(client, {
      ...base,
      type: "expense",
      id: "exp-1",
      expectGlRestoreFollowUp: true,
    });
    expect(stampDocumentReinstated).toHaveBeenCalledWith(
      client,
      expect.objectContaining({ family: "expense", documentId: "exp-1", reinstatedFromVoidJeId: "je-rev-1" })
    );
    expect(result.reinstatedFromVoidJeId).toBe("je-rev-1");
    expect(result.restoreStatus).toBe("posted");
  });

  it("BANK-F-REINSTATE-GL-NOT-RESTORED — refuses a reversed document when the caller does not promise to restore the GL", async () => {
    const client = makeClient([
      {
        needle: "FROM accounting.expenses",
        rows: [
          {
            id: "exp-1",
            status: "void",
            voided_at: "2026-09-28T00:00:00Z",
            posting_status: "reversed",
            reversed_by_je_id: "je-rev-1",
            journal_entry_id: "je-orig-1",
          },
        ],
      },
    ]);
    await expect(reinstateDocument(client, { ...base, type: "expense", id: "exp-1" })).rejects.toMatchObject({
      name: "ReinstateGlNotRestoredError",
      voidReversalJeId: "je-rev-1",
    });
    expect(stampDocumentReinstated).not.toHaveBeenCalled();
  });

  it("bill → stamps reinstate via stampDocumentReinstated(family=bill)", async () => {
    const client = makeClient([
      {
        needle: "FROM accounting.bills",
        rows: [
          {
            id: "bill-1",
            status: "void",
            voided_at: "2026-09-28T00:00:00Z",
            revoked_at: "2026-09-28T00:00:00Z",
            amount_cents: 10000,
            paid_cents: 0,
          },
        ],
      },
    ]);
    const result = await reinstateDocument(client, { ...base, type: "bill", id: "bill-1" });
    expect(stampDocumentReinstated).toHaveBeenCalledWith(
      client,
      expect.objectContaining({ family: "bill", restoreStatus: "unpaid" })
    );
    expect(result.restoreStatus).toBe("unpaid");
  });

  it("invoice → stamps reinstate via stampDocumentReinstated(family=invoice)", async () => {
    const client = makeClient([]);
    await reinstateDocument(client, { ...base, type: "invoice", id: "inv-1" });
    expect(stampDocumentReinstated).toHaveBeenCalledWith(
      client,
      expect.objectContaining({ family: "invoice", restoreStatus: "sent" })
    );
  });
});
