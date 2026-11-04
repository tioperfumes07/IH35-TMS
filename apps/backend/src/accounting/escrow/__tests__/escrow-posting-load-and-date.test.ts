/**
 * ACCT-F11093 / register row 22 — every escrow posting carries its document date and its per-load split.
 * On the old writer: no document_date in the INSERT, no escrow_posting_loads rows, no split check.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../auth/db.js", () => ({ withCurrentUser: vi.fn() }));
vi.mock("../../coa-roles/resolver.service.js", () => ({ resolveRoleAccount: vi.fn() }));
vi.mock("../../journal-entries.service.js", () => ({ createJournalEntryOnClient: vi.fn() }));

import { assertEscrowLoadSplit, loadSettlementEscrowLoadSplit, recordEscrowPostingOnly } from "../service.js";

function fakeClient(over: { lines?: Array<{ id: string; load_id: string | null; cents: string }> } = {}) {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const client = {
    query: vi.fn(async (sql: string, values: unknown[] = []) => {
      calls.push({ sql, values });
      if (sql.includes("FROM accounting.escrow_accounts")) return { rows: [{ id: "ea-1" }] };
      if (sql.includes("INSERT INTO accounting.escrow_postings")) return { rows: [{ id: "ep-1", document_date: "2026-08-10" }] };
      if (sql.includes("FROM driver_finance.settlement_lines sl")) return { rows: over.lines ?? [] };
      return { rows: [] };
    }),
  };
  return { client, calls };
}

const base = {
  operating_company_id: "opco-1",
  driver_id: "drv-1",
  posting_type: "deposit" as const,
  amount_cents: 5000,
  source_type: "driver_settlement" as const,
  source_id: "set-1",
  posted_by_user_id: "u-1",
  linked_journal_entry_id: "je-1",
};

describe("ACCT-F11093 escrow posting carries document date + per-load split", () => {
  it("stamps document_date from the caller, else the linked JE entry_date (never posted_at alone)", async () => {
    const { client, calls } = fakeClient();
    await recordEscrowPostingOnly(client as never, { ...base, document_date: "2026-08-10" });
    const ins = calls.find((c) => c.sql.includes("INSERT INTO accounting.escrow_postings"))!;
    expect(ins.sql).toMatch(/linked_journal_entry_id, document_date/);
    expect(ins.sql).toMatch(/COALESCE\(\$10::date,\s*\(SELECT je\.entry_date FROM accounting\.journal_entries je/);
    expect(ins.values[9]).toBe("2026-08-10");
  });

  it("writes one escrow_posting_loads row per load, dated with the posting's document date", async () => {
    const { client, calls } = fakeClient();
    await recordEscrowPostingOnly(client as never, {
      ...base,
      loads: [
        { load_id: "load-a", settlement_line_id: "sl-a", amount_cents: 2500 },
        { load_id: "load-b", settlement_line_id: "sl-b", amount_cents: 2500 },
      ],
    });
    const splits = calls.filter((c) => c.sql.includes("INSERT INTO accounting.escrow_posting_loads"));
    expect(splits).toHaveLength(2);
    expect(splits.map((c) => c.values[2])).toEqual(["load-a", "load-b"]);
    expect(splits.every((c) => c.values[1] === "ep-1" && c.values[5] === "2026-08-10" && c.values[4] === 2500)).toBe(true);
  });

  it("refuses a split that does not tie to the posting, before writing anything", async () => {
    const { client, calls } = fakeClient();
    await expect(
      recordEscrowPostingOnly(client as never, { ...base, loads: [{ load_id: "load-a", amount_cents: 2500 }] })
    ).rejects.toThrow(/escrow_posting_load_split_mismatch/);
    expect(calls.some((c) => c.sql.includes("INSERT INTO accounting.escrow_postings"))).toBe(false);
  });

  it("refuses a split naming one load twice", () => {
    expect(() =>
      assertEscrowLoadSplit(5000, [
        { load_id: "load-a", amount_cents: 2500 },
        { load_id: "load-a", amount_cents: 2500 },
      ])
    ).toThrow(/appears twice/);
  });

  it("reads a settlement's split from its active escrow lines and reports lines with no load", async () => {
    const { client } = fakeClient({
      lines: [
        { id: "sl-a", load_id: "load-a", cents: "2500" },
        { id: "sl-b", load_id: "load-b", cents: "2500" },
        { id: "sl-c", load_id: null, cents: "2500" },
      ],
    });
    const split = await loadSettlementEscrowLoadSplit(client as never, "opco-1", "set-1");
    expect(split.loads).toEqual([
      { load_id: "load-a", settlement_line_id: "sl-a", amount_cents: 2500 },
      { load_id: "load-b", settlement_line_id: "sl-b", amount_cents: 2500 },
    ]);
    expect(split.lines_without_load).toBe(1);
    expect(split.total_cents).toBe(7500);
  });
});
