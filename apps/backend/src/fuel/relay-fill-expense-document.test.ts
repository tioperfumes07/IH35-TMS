import { describe, expect, it, vi } from "vitest";
import { adoptRelayFillExpenseDocument } from "./fuel-expense-document.service.js";


/** 443.182 C — rows go through the one expense writer's INSERT; read a value by column name, not by position. */
function col(w: { sql: string; values: unknown[] }, name: string): unknown {
  const m = /\(([^)]*)\)\s*VALUES\s*\(([\s\S]*)\)\s*(?:RETURNING[\s\S]*)?$/.exec(w.sql.trim());
  if (!m) throw new Error(`not an INSERT: ${w.sql.slice(0, 80)}`);
  const cols = m[1]!.split(",").map((c) => c.trim());
  const vals = m[2]!.split(",").map((v) => v.trim());
  const i = cols.indexOf(name);
  if (i < 0) throw new Error(`column ${name} not written`);
  const v = vals[i]!;
  return /^\$\d+$/.test(v) ? w.values[Number(v.slice(1)) - 1] : v;
}

// Lead 443.41 A: a Relay fill gets ONE expense document that adopts the SAME journal entry — lines = the entry's own
// debit legs, payment account = its credit leg (1295), vendor Relay — and nothing posts.

const CO = "5c854333-6ea5-4faa-af31-67cb272fef80";
function fakeClient(opts: { existing?: boolean; legs?: Array<{ account_id: string; debit_or_credit: string; amount_cents: string }>; noFuelRow?: boolean } = {}) {
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
    if (/FROM fuel\.fuel_transactions ft/.test(sql)) return { rows: opts.noFuelRow ? [] : [{ id: "ft-1", load_id: "load-1", driver_id: "drv-1", unit_id: "unit-1", trailer_id: null, total_cost: "130.98", txn_date: "2026-08-03", taken: false }] };
    // 443.192 — Relay printed "T163" but ingest never resolved matched_unit_id; only the ONE unit rule (the printed number
    // when exactly one active unit carries it) names the truck. A query reading matched_unit_id alone gets nothing.
    if (/FROM integrations\.relay_fuel_transactions/.test(sql)) {
      // Lead 11:40Z: the printed number counts only among units OPERATED by the fill's company (lessee, else owner).
      const oneRule = /matched_unit_number/.test(sql) && /count\(\*\) = 1/.test(sql) && /COALESCE\(u2\.currently_leased_to_company_id, u2\.owner_company_id\) = r\.operating_company_id/.test(sql);
      return { rows: opts.noFuelRow ? [{ matched_driver_id: null, matched_unit_id: oneRule ? "unit-T163" : null }] : [] };
    }
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
    expect(col(header, "vendor_uuid")).toBe("vendor-relay");
    expect(col(header, "total_amount_cents")).toBe(19903);
    expect(col(header, "journal_entry_id")).toBe("je-1");
    expect(col(header, "payment_account_uuid")).toBe("acct-1295");
    const lines = writes.filter((w) => /INSERT INTO accounting\.expense_lines/.test(w.sql));
    expect(lines.map((l) => [col(l, "expense_account_uuid"), col(l, "amount_cents")])).toEqual([["acct-5000", 13098], ["acct-5010", 6605], ["acct-5005", 200]]);
    expect(writes.some((w) => /journal_entr(y|ies)_post|INSERT INTO accounting\.journal/.test(w.sql))).toBe(false);
  });
  it("443.192: a fill with no fuel row and no matched_unit_id takes the unit the poster posts on (printed number, one truck operated by its own company)", async () => {
    // EXP-2026-00009 (USMCA): the JE posted on T163 by the poster's rule, the document carried no unit. (EXP-2026-00008 printed T169, a
    // unit operated by IH 35 Transportation — the same-company rule now resolves nothing for it.)
    const { client, writes } = fakeClient({ noFuelRow: true });
    const out = await adoptRelayFillExpenseDocument(client as never, { operating_company_id: CO, relay_fill_id: "fill-1", journal_entry_id: "je-1" });
    expect(out.outcome).toBe("created");
    const header = writes.find((w) => /INSERT INTO accounting\.expenses/.test(w.sql))!;
    expect(col(header, "unit_id")).toBe("unit-T163");
    const lines = writes.filter((w) => /INSERT INTO accounting\.expense_lines/.test(w.sql));
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) expect(col(l, "unit_id")).toBe("unit-T163");
  });
});
