// ACCT-F409 (CC-2 2026-10-04), factoring sibling — a swept factoring advance's DEPOSIT SWEEP (source 'factoring_advance_deposit')
// is not a lifecycle posting key, so the advance's void used to reverse its funding legs and leave the sweep standing: the
// clearing account went negative by the advance on every void. The void now reverses the sweep with the same primitive.
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockReverse, mockLegs } = vi.hoisted(() => ({
  mockReverse: vi.fn(async (_c: unknown, i?: { journalEntryId: string }) => ({ reversal: { reversal_journal_entry_id: `rev-${i?.journalEntryId}` } })),
  mockLegs: vi.fn(async () => [{ source_transaction_type: "factoring_advance", event_key: "funding", journal_entry_id: "je-funding" }]),
}));
vi.mock("../../journal-entries.service.js", async (orig) => ({
  ...(await orig<typeof import("../../journal-entries.service.js")>()),
  reverseJournalEntryNoFlip: mockReverse,
}));
vi.mock("../lifecycle-repair.js", async (orig) => ({
  ...(await orig<typeof import("../lifecycle-repair.js")>()),
  findAllLifecyclePostingKeyJes: mockLegs,
}));
vi.mock("../../../lib/feature-flags/service.js", async (orig) => ({
  ...(await orig<typeof import("../../../lib/feature-flags/service.js")>()),
  isEnabled: vi.fn(async () => true),
}));

import { reverseFactoringAdvanceEventInClientTx } from "../poster.service.js";

const input = { operating_company_id: "5c854333-6ea5-4faa-af31-67cb272fef80", factoring_advance_id: "adv-1", actor_user_id: "actor", reason: "void" };
const client = (sweeps: string[]) => ({
  query: vi.fn(async (sql: string) =>
    String(sql).includes("p.source_transaction_type = 'factoring_advance_deposit'") ? { rows: sweeps.map((je) => ({ je })) } : { rows: [] }),
}) as never;

describe("ACCT-F409 — voiding a factoring advance reverses its deposit sweep too", () => {
  beforeEach(() => mockReverse.mockClear());

  it("a swept advance: the funding leg AND the deposit sweep are reversed (the sweep used to be left standing)", async () => {
    const r = await reverseFactoringAdvanceEventInClientTx(client(["je-sweep"]), input as never);
    expect(mockReverse.mock.calls.map((c) => (c[1] as { journalEntryId: string }).journalEntryId)).toEqual(["je-funding", "je-sweep"]);
    expect((r as { all_reversed: Array<{ source_transaction_type: string }> }).all_reversed.map((x) => x.source_transaction_type))
      .toEqual(["factoring_advance", "factoring_advance_deposit"]);
    // the funding reversal stays the canonical primary
    expect((r as { reversal_journal_entry_id: string }).reversal_journal_entry_id).toBe("rev-je-funding");
  });

  it("an advance never swept reverses only its funding leg", async () => {
    await reverseFactoringAdvanceEventInClientTx(client([]), input as never);
    expect(mockReverse.mock.calls.map((c) => (c[1] as { journalEntryId: string }).journalEntryId)).toEqual(["je-funding"]);
  });
});
