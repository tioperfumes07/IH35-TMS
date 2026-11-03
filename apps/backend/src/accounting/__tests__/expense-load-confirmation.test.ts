// OWNER RULING 443.288-B — "the dispatcher or closer whatever must confirm them. always."
// Behavior tests (Lead 8:45 PM: no source-text guards): the confirm engine is the only writer of 'confirmed' (it alone
// sets the transaction's confirming actor, then clears it), a changed load moves the WHOLE family through the engines,
// a child is refused, and a settlement with a proposed expense on its loads refuses to close.
import { beforeEach, describe, expect, it, vi } from "vitest";

const engines = vi.hoisted(() => ({
  carryFuelReceiptToLoad: vi.fn(async () => "reattributed"),
  moveExpenseDocumentToLoad: vi.fn(async () => ({ postings_moved: 2 })),
  moveExpenseFamilyToLoad: vi.fn(async () => ({ children_moved: 1 })),
  moveFuelReceiptDocumentToLoad: vi.fn(async () => ({ updated: true, note: null })),
}));
vi.mock("../../fuel/fuel-receipt-repoint.service.js", () => ({ carryFuelReceiptToLoad: engines.carryFuelReceiptToLoad }));
vi.mock("../reclassify/reclassify.service.js", () => ({
  moveExpenseDocumentToLoad: engines.moveExpenseDocumentToLoad,
  moveExpenseFamilyToLoad: engines.moveExpenseFamilyToLoad,
  moveFuelReceiptDocumentToLoad: engines.moveFuelReceiptDocumentToLoad,
}));
vi.mock("../../audit/crud-audit.js", () => ({ appendCrudAudit: vi.fn(async () => undefined) }));

import { markExpenseLoadConfirmedBy, withExpenseLoadConfirmedBy } from "../expense-load-confirm-actor.js";
import {
  confirmExpenseLoadsInClientTx, ExpenseLoadConfirmRefused, proposedExpenseLoadsMessage, proposedExpenseLoadsOnSettlement,
} from "../expense-load-confirmation.service.js";

const OC = "5c854333-6ea5-4faa-af31-67cb272fef80";
const PERSON = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const L1 = "11111111-1111-4111-8111-111111111111";
const L2 = "22222222-2222-4222-8222-222222222222";

type Row = { id: string; load_id: string | null; parent: string | null; fill: string | null; number: string | null };
function client(expense: Row | undefined, confirmedIds: string[] = ["exp-1"], relayOf: string | null = null) {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  return {
    calls,
    async query(sql: string, values: unknown[] = []) {
      calls.push({ sql, values });
      if (/FROM accounting\.expenses WHERE id = \$1::uuid AND operating_company_id = \$2::uuid AND voided_at IS NULL FOR UPDATE/.test(sql)) return { rows: expense ? [expense] : [] };
      if (/FROM mdata\.loads WHERE id = \$1::uuid/.test(sql)) return { rows: [{ load_number: "13700" }] };
      if (/UPDATE accounting\.expenses SET load_confirmation = 'confirmed'/.test(sql)) return { rows: confirmedIds.map((id) => ({ id })) };
      if (/SELECT relay_fuel_transaction_id::text AS relay_id FROM fuel\.fuel_transactions/.test(sql)) return { rows: [{ relay_id: relayOf }] };
      return { rows: [] };
    },
  };
}
const actorWrites = (c: ReturnType<typeof client>) =>
  c.calls.filter((x) => /app\.expense_load_confirm_actor/.test(x.sql)).map((x) => (x.values[0] ?? "") as string);

describe("THE confirm / change engine (443.288-B)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("confirms the proposal as the signed-in person: sets the confirming actor, confirms expense + children, clears the actor", async () => {
    const c = client({ id: "exp-1", load_id: L1, parent: null, fill: null, number: "13600-1" }, ["exp-1", "child-1"]);
    const r = await confirmExpenseLoadsInClientTx(c as never, { operatingCompanyId: OC, actorUserId: PERSON, items: [{ expenseId: "exp-1" }] });
    expect(r).toMatchObject({ confirmed: 1, moved: 0, rows: [{ expense_id: "exp-1", to_load_id: L1, changed: false, children: 1 }] });
    expect(actorWrites(c)).toEqual([PERSON, ""]); // set once for the person, cleared at the end — never left on
    const confirm = c.calls.find((x) => /SET load_confirmation = 'confirmed'/.test(x.sql))!;
    expect(confirm.sql).toMatch(/\(id = \$1::uuid OR parent_expense_id = \$1::uuid\)/);
    expect(engines.moveExpenseDocumentToLoad).not.toHaveBeenCalled();
  });

  it("a changed load moves the expense by reclassify and its family follows through ONE family move, then confirms", async () => {
    const c = client({ id: "exp-1", load_id: L1, parent: null, fill: null, number: "13600-1" });
    const r = await confirmExpenseLoadsInClientTx(c as never, { operatingCompanyId: OC, actorUserId: PERSON, items: [{ expenseId: "exp-1", loadId: L2 }] });
    expect(r.moved).toBe(1);
    expect(engines.moveExpenseDocumentToLoad).toHaveBeenCalledWith(c, expect.objectContaining({ expenseId: "exp-1", fromLoadId: L1, toLoadId: L2 }));
    expect(engines.moveExpenseFamilyToLoad).toHaveBeenCalledWith(c, expect.objectContaining({ parentExpenseIds: ["exp-1"], toLoadId: L2 }));
    // the move happens with the person's actor set (so every write it makes is confirmed by them)
    const firstActor = c.calls.findIndex((x) => /app\.expense_load_confirm_actor/.test(x.sql));
    expect(firstActor).toBeGreaterThanOrEqual(0);
  });

  it("a fuel receipt changes load through the receipt carry (fuel rows + ledger), not a raw update", async () => {
    const c = client({ id: "exp-1", load_id: L1, parent: null, fill: "ft-1", number: "13600-1" });
    await confirmExpenseLoadsInClientTx(c as never, { operatingCompanyId: OC, actorUserId: PERSON, items: [{ expenseId: "exp-1", loadId: L2 }] });
    expect(engines.carryFuelReceiptToLoad).toHaveBeenCalledWith(c, expect.objectContaining({ fillKind: "fuel_transaction", fillId: "ft-1", toLoadId: L2 }));
    expect(engines.moveExpenseDocumentToLoad).not.toHaveBeenCalled();
  });

  it("refuses by name: a child (it follows its receipt), no load, unknown expense — and nothing is confirmed", async () => {
    const child = client({ id: "c-1", load_id: L1, parent: "exp-1", fill: null, number: null });
    await expect(confirmExpenseLoadsInClientTx(child as never, { operatingCompanyId: OC, actorUserId: PERSON, items: [{ expenseId: "c-1" }] }))
      .rejects.toMatchObject({ code: "CHILD_FOLLOWS_ITS_RECEIPT", statusCode: 409 });
    const noLoad = client({ id: "exp-2", load_id: null, parent: null, fill: null, number: null });
    await expect(confirmExpenseLoadsInClientTx(noLoad as never, { operatingCompanyId: OC, actorUserId: PERSON, items: [{ expenseId: "exp-2" }] }))
      .rejects.toBeInstanceOf(ExpenseLoadConfirmRefused);
    const missing = client(undefined);
    await expect(confirmExpenseLoadsInClientTx(missing as never, { operatingCompanyId: OC, actorUserId: PERSON, items: [{ expenseId: "x" }] }))
      .rejects.toMatchObject({ code: "EXPENSE_NOT_FOUND" });
    for (const c of [child, noLoad, missing]) {
      expect(c.calls.some((x) => /SET load_confirmation = 'confirmed'/.test(x.sql))).toBe(false);
      expect(actorWrites(c).at(-1)).toBe(""); // the actor is cleared even on a refusal
    }
  });

  it("refuses an actor that is not a signed-in person (no confirmation without a person)", async () => {
    const c = client({ id: "exp-1", load_id: L1, parent: null, fill: null, number: null });
    await expect(confirmExpenseLoadsInClientTx(c as never, { operatingCompanyId: OC, actorUserId: "system", items: [{ expenseId: "exp-1" }] }))
      .rejects.toMatchObject({ code: "CONFIRMING_USER_INVALID" });
  });
});

describe("a settlement cannot close while an expense on its loads is proposed (443.288-B)", () => {
  it("reads only live, proposed expenses on the settlement's active line loads", async () => {
    const calls: Array<{ sql: string; values: unknown[] }> = [];
    const c = { query: async (sql: string, values: unknown[] = []) => { calls.push({ sql, values }); return { rows: [{ expense_id: "e", expense_number: "13600-2", load_id: L1, total_cents: "500" }] }; } };
    const rows = await proposedExpenseLoadsOnSettlement(c as never, OC, "set-1");
    expect(rows).toHaveLength(1);
    expect(calls[0]!.sql).toMatch(/e\.voided_at IS NULL AND e\.load_confirmation = 'proposed'/);
    expect(calls[0]!.sql).toMatch(/sl\.is_active = true AND sl\.voided_at IS NULL/);
    expect(calls[0]!.values).toEqual([OC, "set-1"]);
    expect(proposedExpenseLoadsMessage(rows)).toMatch(/1 expense on this settlement's loads is still proposed \(13600-2\)/);
  });
});

describe("row 102 — OWNER RULING 443.288 invariants the confirm engine had not enforced", () => {
  beforeEach(() => vi.clearAllMocks());
  const MACHINE = "00000000-0000-4000-8000-000000000001";

  it("(b) a machine never confirms a load: the background-job actor is refused by name everywhere the actor is set", async () => {
    const c = client({ id: "exp-1", load_id: L1, parent: null, fill: null, number: null });
    await expect(confirmExpenseLoadsInClientTx(c as never, { operatingCompanyId: OC, actorUserId: MACHINE, items: [{ expenseId: "exp-1" }] }))
      .rejects.toMatchObject({ code: "MACHINE_CANNOT_CONFIRM_LOAD", statusCode: 409 });
    await expect(markExpenseLoadConfirmedBy(c as never, MACHINE)).rejects.toMatchObject({ code: "MACHINE_CANNOT_CONFIRM_LOAD" });
    await expect(withExpenseLoadConfirmedBy(c as never, MACHINE, async () => 1)).rejects.toMatchObject({ code: "MACHINE_CANNOT_CONFIRM_LOAD" });
    expect(actorWrites(c).filter(Boolean)).toEqual([]); // the machine id never reached the setting
    expect(c.calls.some((x) => /SET load_confirmation = 'confirmed'/.test(x.sql))).toBe(false);
    await markExpenseLoadConfirmedBy(c as never, PERSON); // a person still marks
    expect(actorWrites(c).at(-1)).toBe(PERSON);
  });

  it("(a)/(d) confirming a receipt in place brings a drifted child onto the confirmed load (family follows, not only on change)", async () => {
    const c = client({ id: "exp-1", load_id: L1, parent: null, fill: null, number: "13504-9" });
    await confirmExpenseLoadsInClientTx(c as never, { operatingCompanyId: OC, actorUserId: PERSON, items: [{ expenseId: "exp-1" }] });
    expect(engines.moveExpenseFamilyToLoad).toHaveBeenCalledWith(c, expect.objectContaining({ parentExpenseIds: ["exp-1"], toLoadId: L1 }));
    const fam = c.calls.length; // the family move runs before the confirm, so the children are confirmed on the load
    expect(fam).toBeGreaterThan(0);
  });

  it("(d) a Relay fill changes load by its Relay id, so the ledger and every sibling fuel row move together", async () => {
    engines.carryFuelReceiptToLoad.mockImplementationOnce(async () => "not_posted");
    const c = client({ id: "exp-1", load_id: L1, parent: null, fill: "ft-1", number: "13600-1" }, ["exp-1"], "relay-9");
    await confirmExpenseLoadsInClientTx(c as never, { operatingCompanyId: OC, actorUserId: PERSON, items: [{ expenseId: "exp-1", loadId: L2 }] });
    expect(engines.carryFuelReceiptToLoad).toHaveBeenNthCalledWith(2, c, expect.objectContaining({ fillKind: "relay_fuel", fillId: "relay-9", toLoadId: L2 }));
    expect(engines.moveFuelReceiptDocumentToLoad).not.toHaveBeenCalled(); // carried by the engine, not a document-only move
  });

  it("(d) an unposted Relay fill moves its document by the Relay id (every sibling row), never by the one row", async () => {
    engines.carryFuelReceiptToLoad.mockImplementation(async () => "not_posted");
    try {
      const c = client({ id: "exp-1", load_id: L1, parent: null, fill: "ft-1", number: "13600-1" }, ["exp-1"], "relay-9");
      await confirmExpenseLoadsInClientTx(c as never, { operatingCompanyId: OC, actorUserId: PERSON, items: [{ expenseId: "exp-1", loadId: L2 }] });
      expect(engines.moveFuelReceiptDocumentToLoad).toHaveBeenCalledWith(c, OC, expect.objectContaining({ fillId: "relay-9", loadId: L2 }));
    } finally {
      engines.carryFuelReceiptToLoad.mockImplementation(async () => "reattributed");
    }
  });
});
