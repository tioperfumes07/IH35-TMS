import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../posting-engine.service.js", () => ({ ensureOpenPeriod: vi.fn(async () => undefined) }));
vi.mock("../accounting-spine-emit.js", () => ({ writeTransactionSourceLink: vi.fn(async () => undefined) }));
vi.mock("../../audit/crud-audit.js", () => ({ appendCrudAudit: vi.fn(async () => undefined) }));
vi.mock("../journal-entry-type-resolver.js", () => ({
  hasJournalEntryTypeColumn: vi.fn(async () => false),
  inferJournalEntryTypeCode: vi.fn(() => null),
  resolveJournalEntryTypeId: vi.fn(async () => null),
}));
vi.mock("../../auth/db.js", () => ({ withCurrentUser: vi.fn() }));
vi.mock("../../integrations/qbo/qbo-sync.service.js", () => ({ enqueueSyncJob: vi.fn() }));
vi.mock("../../lib/feature-flags/service.js", () => ({ isEnabled: vi.fn(async () => false) }));
vi.mock("../journal-entry-qbo-push.service.js", () => ({ pushJournalEntryToQuickBooksImmediateBestEffort: vi.fn() }));
vi.mock("../void.service.js", () => ({ auditVoid: vi.fn(), canVoid: vi.fn(), postVoidReversal: vi.fn() }));
vi.mock("../../driver-finance/settlement-historical-attribution.service.js", () => ({
  assertNoHistoricalJournalCoverage: vi.fn(async () => undefined),
}));

import { createJournalEntryOnClient } from "../journal-entries.service.js";

const COMPANY = "5c854333-6ea5-4faa-af31-67cb272fef80";
const JE_ID = "11111111-1111-4111-8111-111111111111";
const ACTOR = { userId: "22222222-2222-4222-8222-222222222222", role: "Owner" };

type Line = { source_transaction_type: string | null; source_transaction_id: string | null };

/** Records every inserted posting line and answers the writer's own unsourced-line count from them. */
function fakeClient() {
  const lines: Line[] = [];
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes("INSERT INTO accounting.journal_entries")) {
      return { rows: [{ id: JE_ID, operating_company_id: COMPANY, entry_date: "2026-09-22", memo: null, status: "posted", source: params[3], qbo_sync_pending: true, created_at: "" }] };
    }
    if (sql.includes("INSERT INTO accounting.journal_entry_postings")) {
      lines.push({ source_transaction_type: (params[11] as string) ?? null, source_transaction_id: (params[12] as string) ?? null });
      return { rows: [{ id: `line-${lines.length}` }] };
    }
    if (sql.includes("UPDATE accounting.journal_entry_postings")) {
      for (const l of lines) {
        if (l.source_transaction_type == null) {
          l.source_transaction_type = params[0] as string;
          l.source_transaction_id = params[1] as string;
        }
      }
      return { rows: [] };
    }
    if (sql.includes("FROM accounting.journal_entry_postings") && sql.includes("source_transaction_type IS NULL")) {
      const n = lines.filter((l) => l.source_transaction_type == null || l.source_transaction_id == null).length;
      return { rows: [{ n: String(n) }] };
    }
    return { rows: [] };
  });
  return { client: { query } as never, lines, query };
}

const twoLines = [
  { account_id: "a-debit", debit_or_credit: "debit" as const, amount_cents: 1000 },
  { account_id: "a-credit", debit_or_credit: "credit" as const, amount_cents: 1000 },
];

describe("createJournalEntryOnClient — every posting names its source", () => {
  beforeEach(() => vi.clearAllMocks());

  it("REFUSES an automated entry whose lines carry no source", async () => {
    const { client, lines } = fakeClient();
    await expect(
      createJournalEntryOnClient(client, { operating_company_id: COMPANY, entry_date: "2026-09-22", source: "auto", postings: twoLines }, ACTOR)
    ).rejects.toThrow("journal_entry_posting_source_required");
    expect(lines).toHaveLength(2);
    expect(lines.every((l) => l.source_transaction_type === null)).toBe(true);
  });

  it("writes the entry-level source onto every line", async () => {
    const { client, lines } = fakeClient();
    await createJournalEntryOnClient(
      client,
      { operating_company_id: COMPANY, entry_date: "2026-09-22", source: "auto", source_transaction_type: "invoice", source_transaction_id: "inv-1", postings: twoLines },
      ACTOR
    );
    expect(lines).toEqual([
      { source_transaction_type: "invoice", source_transaction_id: "inv-1" },
      { source_transaction_type: "invoice", source_transaction_id: "inv-1" },
    ]);
  });

  it("accepts a source stamped in afterInsertBeforeCommit (the factoring poster's pattern)", async () => {
    const { client, lines } = fakeClient();
    await createJournalEntryOnClient(
      client,
      { operating_company_id: COMPANY, entry_date: "2026-09-22", source: "auto", postings: twoLines },
      ACTOR,
      {
        afterInsertBeforeCommit: async (c) => {
          await c.query("UPDATE accounting.journal_entry_postings SET source_transaction_type = $1, source_transaction_id = $2", ["factoring_advance", "fa-1"]);
        },
      }
    );
    expect(lines.every((l) => l.source_transaction_type === "factoring_advance" && l.source_transaction_id === "fa-1")).toBe(true);
  });

  it("makes a hand-keyed entry its own source", async () => {
    const { client, lines } = fakeClient();
    await createJournalEntryOnClient(client, { operating_company_id: COMPANY, entry_date: "2026-09-22", source: "manual", postings: twoLines }, ACTOR);
    expect(lines.every((l) => l.source_transaction_type === "manual_je" && l.source_transaction_id === JE_ID)).toBe(true);
  });

  it("refuses a half-filled source before writing anything", async () => {
    const { client, query } = fakeClient();
    await expect(
      createJournalEntryOnClient(
        client,
        { operating_company_id: COMPANY, entry_date: "2026-09-22", source: "auto", source_transaction_type: "invoice", postings: twoLines },
        ACTOR
      )
    ).rejects.toThrow("journal_entry_posting_source_pair_incomplete");
    expect(query).not.toHaveBeenCalled();
  });
});
