import { describe, expect, it, vi } from "vitest";

import { createExpenseFromFuelTransaction } from "../fuel-expense-document.service.js";

const OPCO = "5c854333-6ea5-4faa-af31-67cb272fef80";
const FUEL_ID = "11111111-1111-4111-8111-111111111111";
const LOAD_ID = "22222222-2222-4222-8222-222222222222";
const VENDOR_ID = "33333333-3333-4333-8333-333333333333";
const ITEM_ID = "44444444-4444-4444-8444-444444444444";
const ACCOUNT_ID = "55555555-5555-4555-8555-555555555555";

type Call = { sql: string; values: unknown[] };

/**
 * R-169 fix 1/2 — a load-attributed fuel transaction must mint a load-scoped expense_number
 * (never EXP-2026-#####) and must always write its own accounting.expense_lines row, adopted or
 * not. Pattern-matches SQL text the same way display-id-series-prefix.test.ts does; unmatched
 * SELECTs fall back to a plausible single row rather than crashing, since this function's
 * dependency chain (credit-rail resolution) is not the subject under test here.
 */
function fakeClient(opts: { hasLoad: boolean; fuelType?: string; adopted?: boolean }) {
  const calls: Call[] = [];
  let seq = 0;
  const client = {
    query: vi.fn(async (sql: string, values: unknown[] = []) => {
      calls.push({ sql, values });
      if (/FROM fuel\.fuel_transactions/.test(sql) && /WHERE id = \$1/.test(sql)) {
        return {
          rows: [
            {
              id: FUEL_ID,
              operating_company_id: OPCO,
              vendor_id: VENDOR_ID,
              load_id: opts.hasLoad ? LOAD_ID : null,
              driver_id: null,
              unit_id: null,
              fuel_type: opts.fuelType ?? "diesel",
              gallons: "100",
              price_per_gallon: "4.00",
              total_cost: "400.00",
              transaction_at: "2026-09-25T00:00:00Z",
              purchased_at: "2026-09-25T00:00:00Z",
              transaction_reference: "REF-1",
              location_city: "Laredo",
              location_state: "TX",
              archived_at: null,
            },
          ],
        };
      }
      if (/FROM accounting\.expenses/.test(sql) && /source_fuel_transaction_id = \$2/.test(sql)) {
        return { rows: [] }; // not already created
      }
      if (/FROM accounting\.transaction_source_links/.test(sql)) {
        return { rows: opts.adopted ? [{ je: "je-adopted-1" }] : [] };
      }
      if (/FROM catalogs\.items/.test(sql)) {
        return { rows: [{ id: ITEM_ID, expense_account_id: ACCOUNT_ID }] };
      }
      if (/expense_attribution\.expense_seq_per_load/.test(sql) && /INSERT/.test(sql)) {
        return { rows: [] };
      }
      if (/expense_attribution\.expense_seq_per_load/.test(sql) && /UPDATE/.test(sql)) {
        seq += 1;
        return { rows: [{ last_seq: seq }] };
      }
      if (/FROM mdata\.loads/.test(sql) && /load_number/.test(sql)) {
        return { rows: [{ load_number: "13508" }] };
      }
      if (/INSERT INTO accounting\.expenses/.test(sql)) {
        return { rows: [{ id: "expense-row-1" }] };
      }
      // Everything else (credit-rail resolution chain, audit): a plausible single row so the
      // function completes without inventing behavior this test isn't about.
      return { rows: [{ id: ACCOUNT_ID, account_id: ACCOUNT_ID, source: "test", code: "X" }] };
    }),
  };
  return { client, calls };
}

const insertsTo = (calls: Call[], table: string) => calls.filter((c) => new RegExp(`INSERT INTO ${table}`).test(c.sql));

describe("R-169 fix 1 — load-attributed fuel expenses mint the load-scoped number, not EXP-####", () => {
  it("mints the load-scoped number (bare load_number first, never EXP-2026-#####) when the fuel row carries a load_id", async () => {
    const { client, calls } = fakeClient({ hasLoad: true });
    const outcome = await createExpenseFromFuelTransaction(client as never, {
      operating_company_id: OPCO,
      fuel_transaction_id: FUEL_ID,
    });
    expect(outcome.outcome).toBe("created");
    if (outcome.outcome !== "created") throw new Error("unreachable");
    // generateExpenseNumber's own convention (expense-number.ts): seq 1 -> bare load number, seq
    // 2 -> "<load>-1", etc. -- this is the first fuel expense on this load in the test.
    expect(outcome.expense_number).toBe("13508");
    expect(outcome.expense_number).not.toMatch(/^EXP-/);

    const expenseInsert = insertsTo(calls, "accounting\\.expenses")[0];
    expect(expenseInsert.values).toContain("13508");
  });

  it("falls back to the EXP-2026-##### series when the fuel row has no load_id", async () => {
    const { client } = fakeClient({ hasLoad: false });
    const outcome = await createExpenseFromFuelTransaction(client as never, {
      operating_company_id: OPCO,
      fuel_transaction_id: FUEL_ID,
    });
    expect(outcome.outcome).toBe("created");
    if (outcome.outcome !== "created") throw new Error("unreachable");
    expect(outcome.expense_number).toMatch(/^EXP-\d{4}-\d{5}$/);
  });

  it("refuses rather than guessing an account for an unmapped fuel_type", async () => {
    const { client } = fakeClient({ hasLoad: true, fuelType: "gas" });
    const outcome = await createExpenseFromFuelTransaction(client as never, {
      operating_company_id: OPCO,
      fuel_transaction_id: FUEL_ID,
    });
    expect(outcome.outcome).toBe("refused");
  });
});

describe("R-169 fix 2 — the function always writes its own expense_lines row", () => {
  it("writes exactly one accounting.expense_lines row on a fresh (non-adopted) draft", async () => {
    const { client, calls } = fakeClient({ hasLoad: true, adopted: false });
    const outcome = await createExpenseFromFuelTransaction(client as never, {
      operating_company_id: OPCO,
      fuel_transaction_id: FUEL_ID,
    });
    expect(outcome.outcome).toBe("created");
    const lineInserts = insertsTo(calls, "accounting\\.expense_lines");
    expect(lineInserts).toHaveLength(1);
    expect(lineInserts[0].values).toContain(40000); // amount_cents for $400.00
    expect(lineInserts[0].values).toContain(ACCOUNT_ID);
    expect(lineInserts[0].values).toContain(ITEM_ID);
  });

  it("ALSO writes accounting.expense_lines when adopting an already-posted journal entry -- this is the exact gap that broke 'lines must sum to total' and forced R-167 to hand-add 6 lines", async () => {
    const { client, calls } = fakeClient({ hasLoad: true, adopted: true });
    const outcome = await createExpenseFromFuelTransaction(client as never, {
      operating_company_id: OPCO,
      fuel_transaction_id: FUEL_ID,
    });
    expect(outcome.outcome).toBe("created");
    if (outcome.outcome !== "created") throw new Error("unreachable");
    expect(outcome.adopted_journal_entry_id).toBe("je-adopted-1");
    expect(insertsTo(calls, "accounting\\.expense_lines")).toHaveLength(1);
  });

  it("writes expense_attribution.expense_load_links only when the fuel row carries a load", async () => {
    const withLoad = fakeClient({ hasLoad: true });
    await createExpenseFromFuelTransaction(withLoad.client as never, { operating_company_id: OPCO, fuel_transaction_id: FUEL_ID });
    expect(insertsTo(withLoad.calls, "expense_attribution\\.expense_load_links")).toHaveLength(1);

    const withoutLoad = fakeClient({ hasLoad: false });
    await createExpenseFromFuelTransaction(withoutLoad.client as never, { operating_company_id: OPCO, fuel_transaction_id: FUEL_ID });
    expect(insertsTo(withoutLoad.calls, "expense_attribution\\.expense_load_links")).toHaveLength(0);
  });
});
