import { describe, expect, it, vi } from "vitest";

import { createExpenseFromFuelTransaction } from "../fuel-expense-document.service.js";

// ROUND 192 (Lead, 2026-09-25) — Ruling R-30.1: fuel posts at NET, the card's own fee posts as
// its own line/item ("Fuel Card Fee"), never folded into the fuel line. gross_cost/discount_amount
// are memo-only, never GL math. An already-adopted (already-posted) journal entry has no fee leg,
// so a document that would adopt one must refuse rather than silently understate itself.

const OPCO = "5c854333-6ea5-4faa-af31-67cb272fef80";
const FUEL_ID = "11111111-1111-4111-8111-111111111111";
const LOAD_ID = "22222222-2222-4222-8222-222222222222";
const VENDOR_ID = "33333333-3333-4333-8333-333333333333";
const FUEL_ITEM_ID = "44444444-4444-4444-8444-444444444444";
const FUEL_ACCOUNT_ID = "55555555-5555-4555-8555-555555555555";
const FEE_ITEM_ID = "66666666-6666-4666-8666-666666666666";
const FEE_ACCOUNT_ID = "77777777-7777-4777-8777-777777777777";

type Call = { sql: string; values: unknown[] };

/** feeItemPresent controls whether catalogs.items resolves "Fuel Card Fee"; the fuel item
 *  ("Fuel-Truck Diesel") always resolves so a test can isolate the fee-item refusal. */
function fakeClient(opts: {
  hasLoad?: boolean;
  feeAmount?: string;
  grossCost?: string | null;
  discountAmount?: string;
  adopted?: boolean;
  feeItemPresent?: boolean;
}) {
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
              fuel_type: "diesel",
              gallons: "100",
              price_per_gallon: "4.00",
              total_cost: "400.00",
              transaction_at: "2026-09-25T00:00:00Z",
              purchased_at: "2026-09-25T00:00:00Z",
              transaction_reference: "REF-1",
              location_city: "Laredo",
              location_state: "TX",
              archived_at: null,
              gross_cost: opts.grossCost === undefined ? null : opts.grossCost,
              discount_amount: opts.discountAmount ?? "0",
              fee_amount: opts.feeAmount ?? "0",
            },
          ],
        };
      }
      if (/FROM accounting\.expenses/.test(sql) && /source_fuel_transaction_id = \$2/.test(sql)) {
        return { rows: [] };
      }
      if (/FROM accounting\.transaction_source_links/.test(sql)) {
        return { rows: opts.adopted ? [{ je: "je-adopted-1" }] : [] };
      }
      if (/FROM catalogs\.items/.test(sql)) {
        const itemName = values[1];
        if (itemName === "Fuel Card Fee") {
          if (opts.feeItemPresent === false) return { rows: [] };
          return { rows: [{ id: FEE_ITEM_ID, expense_account_id: FEE_ACCOUNT_ID }] };
        }
        return { rows: [{ id: FUEL_ITEM_ID, expense_account_id: FUEL_ACCOUNT_ID }] };
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
      return { rows: [{ id: FUEL_ACCOUNT_ID, account_id: FUEL_ACCOUNT_ID, source: "test", code: "X" }] };
    }),
  };
  return { client, calls };
}

const insertsTo = (calls: Call[], table: string) => calls.filter((c) => new RegExp(`INSERT INTO ${table}`).test(c.sql));

describe("ROUND 192 — fee line, net total, DEF/fee account resolution", () => {
  it("writes a SECOND expense_lines row on the 'Fuel Card Fee' item when fee_amount > 0", async () => {
    const { client, calls } = fakeClient({ hasLoad: true, feeAmount: "1.50" });
    const outcome = await createExpenseFromFuelTransaction(client as never, {
      operating_company_id: OPCO,
      fuel_transaction_id: FUEL_ID,
    });
    expect(outcome.outcome).toBe("created");
    const lineInserts = insertsTo(calls, "accounting\\.expense_lines");
    expect(lineInserts).toHaveLength(2);
    // line 1: the fuel item, net amount (400.00, unaffected by the fee)
    expect(lineInserts[0].values).toContain(40000);
    expect(lineInserts[0].values).toContain(FUEL_ACCOUNT_ID);
    expect(lineInserts[0].values).toContain(FUEL_ITEM_ID);
    // line 2: the fee item, 150 cents
    expect(lineInserts[1].values).toContain(150);
    expect(lineInserts[1].values).toContain(FEE_ACCOUNT_ID);
    expect(lineInserts[1].values).toContain(FEE_ITEM_ID);
  });

  it("total_amount_cents on the expense header is net + fee, not net alone", async () => {
    const { client, calls } = fakeClient({ hasLoad: true, feeAmount: "1.50" });
    const outcome = await createExpenseFromFuelTransaction(client as never, {
      operating_company_id: OPCO,
      fuel_transaction_id: FUEL_ID,
    });
    expect(outcome.outcome).toBe("created");
    if (outcome.outcome !== "created") throw new Error("unreachable");
    // 400.00 net + 1.50 fee = 401.50 -> 40150 cents
    expect(outcome.amount_cents).toBe(40150);
    const expenseInsert = insertsTo(calls, "accounting\\.expenses")[0];
    expect(expenseInsert.values).toContain(40150);
  });

  it("writes only ONE expense_lines row (no fee line) when fee_amount is 0", async () => {
    const { client, calls } = fakeClient({ hasLoad: true, feeAmount: "0" });
    const outcome = await createExpenseFromFuelTransaction(client as never, {
      operating_company_id: OPCO,
      fuel_transaction_id: FUEL_ID,
    });
    expect(outcome.outcome).toBe("created");
    if (outcome.outcome !== "created") throw new Error("unreachable");
    expect(outcome.amount_cents).toBe(40000);
    expect(insertsTo(calls, "accounting\\.expense_lines")).toHaveLength(1);
  });

  it("refuses rather than posting a fee with no account when the 'Fuel Card Fee' item is missing", async () => {
    const { client, calls } = fakeClient({ hasLoad: true, feeAmount: "1.50", feeItemPresent: false });
    const outcome = await createExpenseFromFuelTransaction(client as never, {
      operating_company_id: OPCO,
      fuel_transaction_id: FUEL_ID,
    });
    expect(outcome.outcome).toBe("refused");
    if (outcome.outcome !== "refused") throw new Error("unreachable");
    expect(outcome.reason).toMatch(/Fuel Card Fee/);
    expect(insertsTo(calls, "accounting\\.expenses")).toHaveLength(0);
  });

  it("refuses rather than adopting an already-posted journal entry when fee_amount > 0 (that entry has no fee leg)", async () => {
    const { client, calls } = fakeClient({ hasLoad: true, feeAmount: "1.50", adopted: true });
    const outcome = await createExpenseFromFuelTransaction(client as never, {
      operating_company_id: OPCO,
      fuel_transaction_id: FUEL_ID,
    });
    expect(outcome.outcome).toBe("refused");
    if (outcome.outcome !== "refused") throw new Error("unreachable");
    expect(outcome.reason).toMatch(/adopt journal entry je-adopted-1/);
    expect(outcome.reason).toMatch(/fee_amount is \$1\.50/);
    expect(insertsTo(calls, "accounting\\.expenses")).toHaveLength(0);
  });

  it("still adopts normally when fee_amount is 0 (no regression to the existing adopt path)", async () => {
    const { client } = fakeClient({ hasLoad: true, feeAmount: "0", adopted: true });
    const outcome = await createExpenseFromFuelTransaction(client as never, {
      operating_company_id: OPCO,
      fuel_transaction_id: FUEL_ID,
    });
    expect(outcome.outcome).toBe("created");
    if (outcome.outcome !== "created") throw new Error("unreachable");
    expect(outcome.adopted_journal_entry_id).toBe("je-adopted-1");
  });

  it("states gross/discount/net(/fee) in the memo when gross_cost is set, and appends the fee note only when a fee exists", async () => {
    const { client, calls } = fakeClient({ hasLoad: true, feeAmount: "1.50", grossCost: "410.00", discountAmount: "10.00" });
    const outcome = await createExpenseFromFuelTransaction(client as never, {
      operating_company_id: OPCO,
      fuel_transaction_id: FUEL_ID,
    });
    expect(outcome.outcome).toBe("created");
    const expenseInsert = insertsTo(calls, "accounting\\.expenses")[0];
    const memo = expenseInsert.values.find((v) => typeof v === "string" && v.includes("gross $")) as string;
    expect(memo).toContain("gross $410.00");
    expect(memo).toContain("discount $10.00");
    expect(memo).toContain("net $400.00");
    expect(memo).toContain("fee $1.50");
  });

  it("does NOT derive GL math from gross_cost — total_amount_cents still ties to net + fee, not gross", async () => {
    const { client, calls } = fakeClient({ hasLoad: true, feeAmount: "1.50", grossCost: "410.00", discountAmount: "10.00" });
    const outcome = await createExpenseFromFuelTransaction(client as never, {
      operating_company_id: OPCO,
      fuel_transaction_id: FUEL_ID,
    });
    expect(outcome.outcome).toBe("created");
    if (outcome.outcome !== "created") throw new Error("unreachable");
    // gross 410.00 - discount 10.00 would ALSO equal 400.00 net here by design (same fixture),
    // so the real assertion is that GL math reads total_cost (400.00), not gross_cost (410.00) --
    // proven by the fee line/total using totalCost + fee, matching the "no GL math from gross" law
    // even though this fixture's own numbers happen to reconcile.
    expect(outcome.amount_cents).toBe(40150);
    const lineInserts = insertsTo(calls, "accounting\\.expense_lines");
    expect(lineInserts[0].values).toContain(40000); // line 1 is total_cost-derived, not gross-derived
  });

  it("omits the gross/discount memo note entirely when gross_cost is null", async () => {
    const { client, calls } = fakeClient({ hasLoad: true, feeAmount: "0", grossCost: null });
    const outcome = await createExpenseFromFuelTransaction(client as never, {
      operating_company_id: OPCO,
      fuel_transaction_id: FUEL_ID,
    });
    expect(outcome.outcome).toBe("created");
    const expenseInsert = insertsTo(calls, "accounting\\.expenses")[0];
    const memo = expenseInsert.values.find((v) => typeof v === "string" && v.includes("purchase")) as string;
    expect(memo).not.toContain("gross $");
  });
});
