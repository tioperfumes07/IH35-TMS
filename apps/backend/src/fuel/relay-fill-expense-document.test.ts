import { describe, expect, it, vi } from "vitest";
import { adoptRelayFillExpenseDocument } from "./fuel-expense-document.service.js";

// Lead 443.41 A: a Relay fill gets ONE expense document that adopts the SAME journal entry — lines = the entry's own
// debit legs, payment account = its credit leg (1295), vendor Relay — and nothing posts.

const CO = "5c854333-6ea5-4faa-af31-67cb272fef80";
function fakeClient(opts: { existing?: boolean; legs?: Array<{ account_id: string; debit_or_credit: string; amount_cents: string }> } = {}) {
  const writes: Array<{ sql: string; values: unknown[] }> = [];
  const legs = opts.legs ?? [
    { account_id: "acct-5000", debit_or_credit: "debit", amount_cents: "13098" },
    { account_id: "acct-5010", debit_or_credit: "debit", amount_cents: "6605" },
    { account_id: "acct-5005", debit_or_credit: "debit", amount_cents: "200" },
    { account_id: "acct-1295", debit_or_credit: "credit", amount_cents: "19903" },
  ];
  const query = vi.fn(async (sql: string, values: unknown[] = []) => {
    if (/UPDATE expense_attribution\.expense_seq_per_load/.test(sql)) return { rows: [{ last_seq: 1 }] };
    if (/SELECT load_number\s+FROM mdata\.loads/.test(sql)) return { rows: [{ load_number: "13502" }] };
    if (/INSERT INTO accounting\.expenses/.test(sql)) { writes.push({ sql, values }); return { rows: [{ id: "exp-1" }] }; }
    if (/INSERT INTO/.test(sql)) { writes.push({ sql, values }); return { rows: [] }; }
    if (/FROM accounting\.expenses/.test(sql) && /journal_entry_id = \$2/.test(sql)) return { rows: opts.existing ? [{ id: "exp-old" }] : [] };
    if (/FROM accounting\.journal_entry_postings p/.test(sql)) return { rows: legs.map((l) => ({ ...l, load_id: "load-1", entry_date: "2026-08-03" })) };
    if (/FROM mdata\.vendors/.test(sql)) return { rows: [{ id: "vendor-relay" }] };
    if (/FROM fuel\.fuel_transactions ft/.test(sql)) return { rows: [{ id: "ft-1", load_id: "load-1", driver_id: "drv-1", unit_id: "unit-1", trailer_id: null, total_cost: "130.98", txn_date: "2026-08-03", taken: false }] };
    if (/FROM integrations\.relay_fuel_transactions/.test(sql)) return { rows: [] };
    if (/FROM catalogs\.items|catalogs\.accounts/.test(sql)) return { rows: [] };
    if (/expense_number|load_number|FROM mdata\.loads/.test(sql)) return { rows: [{ load_number: "13502", n: 0, max: null, next_seq: 1, number: "13502" }] };
    return { rows: [] };
  });
  return { client: { query }, writes };
}

describe("adoptRelayFillExpenseDocument (443.41 A)", () => {
  it("is idempotent: an entry that already has a live document is not documented twice", async () => {
    const { client, writes } = fakeClient({ existing: true });
    const out = await adoptRelayFillExpenseDocument(client as never, { operating_company_id: CO, relay_fill_id: "fill-1", journal_entry_id: "je-1" });
    expect(out).toEqual({ outcome: "already_exists", expense_id: "exp-old", journal_entry_id: "je-1" });
    expect(writes).toHaveLength(0);
  });
  it("refuses an entry that is not one footed Relay-fill posting", async () => {
    const { client, writes } = fakeClient({ legs: [{ account_id: "acct-5000", debit_or_credit: "debit", amount_cents: "100" }] });
    const out = await adoptRelayFillExpenseDocument(client as never, { operating_company_id: CO, relay_fill_id: "fill-1", journal_entry_id: "je-1" });
    expect(out.outcome).toBe("refused");
    expect(writes).toHaveLength(0);
  });
  it("writes one posted document on the SAME entry: vendor Relay, paid from the credit leg, one line per debit leg", async () => {
    const { client, writes } = fakeClient();
    const out = await adoptRelayFillExpenseDocument(client as never, { operating_company_id: CO, relay_fill_id: "fill-1", journal_entry_id: "je-1" });
    expect(out).toMatchObject({ outcome: "created", expense_id: "exp-1", journal_entry_id: "je-1", amount_cents: 19903 });
    const header = writes.find((w) => /INSERT INTO accounting\.expenses/.test(w.sql))!;
    expect(header.values[1]).toBe("vendor-relay");
    expect(header.values[3]).toBe(19903);
    expect(header.values[8]).toBe("je-1");
    expect(header.values[9]).toBe("acct-1295");
    const lines = writes.filter((w) => /INSERT INTO accounting\.expense_lines/.test(w.sql));
    expect(lines.map((l) => [l.values[8], l.values[4]])).toEqual([["acct-5000", 13098], ["acct-5010", 6605], ["acct-5005", 200]]);
    expect(writes.some((w) => /journal_entr(y|ies)_post|INSERT INTO accounting\.journal/.test(w.sql))).toBe(false);
  });
});
