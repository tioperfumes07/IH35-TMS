/**
 * LEAD 443.192 — a posted fuel receipt follows the load the ONE fuel-to-load rule names, through the reclassify engine.
 *
 * Prod 2026-10-17 (read-only): 44 postings / 12 Relay fills failed verify-every-load-born-posting-carries-its-load RULE 2.
 * Each fill posted ON RECEIPT with no load; Book Load of the truck's earlier load (booked "dispatched", no stop stamps yet)
 * attached it there (fill-once); seconds later that load's delivery was stamped (it no longer covered the fill) and the
 * truck's next load was booked — the rule now named the next load, but the attach engine only ever looked at load-less
 * receipts, so the postings could never move. The Settlement Creator then wrote the fill's fuel row on the rule's load and
 * the row (the postings' source) and the postings disagreed. 38 of 58 attached receipts were on a load the rule no longer
 * names.
 *
 * Fails on the old code: classifySelection refused every fuel_event load move ("lines carry no item / load to move"), and
 * fuel-receipt-repoint.service.ts had no re-attribution (reattributeFuelReceiptsForLoad / carryFuelReceiptToLoad undefined;
 * repointFuelReceiptsToLoad never touched a receipt already on a load).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const reclassifyCalls: Array<Record<string, unknown>> = [];
let reclassifyResult: Record<string, unknown> = {};
vi.mock("../../accounting/reclassify/reclassify.service.js", async (orig) => {
  const real = await orig<typeof import("../../accounting/reclassify/reclassify.service.js")>();
  return {
    ...real,
    applyReclassifyOnClient: vi.fn(async (_client: unknown, input: Record<string, unknown>) => {
      reclassifyCalls.push(input);
      return reclassifyResult;
    }),
  };
});
let ruleLoad: { load_id: string; load_number: string } | null = null;
vi.mock("../fuel-load-at-time.js", () => ({
  resolveFuelLoadAtTime: vi.fn(async () => (ruleLoad ? { ...ruleLoad, matched_by: "unit", trailer_id: null, non_owned_trailer_id: null } : null)),
}));
vi.mock("../../audit/crud-audit.js", () => ({ appendCrudAudit: vi.fn(async () => undefined) }));

import { classifySelection, type SelectedPosting } from "../../accounting/reclassify/reclassify.service.js";
import * as repoint from "../fuel-receipt-repoint.service.js";
import { appendCrudAudit } from "../../audit/crud-audit.js";

const OLD = "00000000-0000-4000-8000-0000000013a1"; // the load the receipt was attached to at booking
const NEW = "00000000-0000-4000-8000-0000000013b2"; // the load the one rule names now
const FILL = "00000000-0000-4000-8000-00000000f111";

const fuelLine = (over: Partial<SelectedPosting> = {}): SelectedPosting => ({
  posting_id: "p1", journal_entry_id: "je1", entry_date: "2026-10-10", source_transaction_type: "fuel_event", source_transaction_id: FILL,
  source_transaction_line_id: null, document_number: null, account_id: "acc-diesel", account_number: "5010", account_name: "Fuel-Truck Diesel",
  class_id: null, class_name: null, location_id: null, location_name: null, entity_uuid: null, entity_type: null, entity_name: null,
  description: "Relay fill", debit_or_credit: "debit", amount_cents: 53348, net_amount_cents: 53348, already_reclassified_batch_id: null,
  je_status: "posted", memo: null, is_reversed: false, is_reversal: false, item_id: null, item_name: null, load_id: OLD, load_number: "13658",
  ...over,
} as SelectedPosting);

type Call = { sql: string; params: unknown[] };
function fakeClient(rowsFor: (sql: string, params: unknown[]) => unknown[] | null) {
  const calls: Call[] = [];
  return {
    calls,
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      return { rows: rowsFor(sql, params) ?? [], rowCount: 1 };
    }),
  };
}

const attachedRow = { fill_kind: "relay_fuel", fill_id: FILL, at: "2026-10-10 02:55:18+00", unit_id: "unit-1", driver_id: "drv-1", stamp_load_id: OLD, posting_ids: ["p1", "p2", "p3", "p4"], doc_load_id: null as string | null };
const okBatch = { batch_id: "b1", lines_requested: 4, lines_applied: 4, lines_refused: 0, amount_cents_moved: 106896, documents: [{ reclass_journal_entry_id: "je-rc", refusal_reason: null }] };

beforeEach(() => {
  reclassifyCalls.length = 0;
  reclassifyResult = okBatch;
  ruleLoad = null;
  vi.mocked(appendCrudAudit).mockClear();
});

describe("reclassify engine — a fuel receipt moves by load, whole and alone (443.192)", () => {
  it("a fuel_event line is eligible for a load move (old code refused it)", () => {
    const { eligible, refused } = classifySelection([fuelLine(), fuelLine({ posting_id: "p2", debit_or_credit: "credit", account_id: "acc-relay-wallet", system_purpose: "relay_fuel_wallet" } as Partial<SelectedPosting>)], { to_load_id: NEW });
    expect(refused).toEqual([]);
    expect(eligible.map((p) => p.posting_id)).toEqual(["p1", "p2"]);
  });

  it("a fuel_event load move with an account change in the same batch is refused by name; an item move stays refused", () => {
    expect(classifySelection([fuelLine()], { to_load_id: NEW, to_account_id: "acc-x" }).refused[0]?.why).toMatch(/moves to another load on its own/);
    expect(classifySelection([fuelLine()], { to_item_id: "item-x" }).refused[0]?.why).toMatch(/carry no item \/ load/);
  });

  it("a fuel_event line already on the target load is refused as no change", () => {
    expect(classifySelection([fuelLine({ load_id: NEW })], { to_load_id: NEW }).refused[0]?.why).toMatch(/already carries/);
  });
});

describe("booking / edit hook re-attributes a receipt the rule no longer names (443.192)", () => {
  const attachedOnly = (sql: string) => (sql.includes("WITH live AS") ? [attachedRow] : sql.includes("WITH posted AS") ? [] : null);

  it("moves every live posting of the receipt to the rule's load through the reclassify engine, audited", async () => {
    ruleLoad = { load_id: NEW, load_number: "13671" };
    const client = fakeClient(attachedOnly);
    const out = await repoint.repointFuelReceiptsToLoad(client as never, { operatingCompanyId: "co", loadId: NEW, actorUserId: "u1" });
    expect(out).toEqual([]); // nothing load-less to attach
    expect(reclassifyCalls).toHaveLength(1);
    expect(reclassifyCalls[0]).toMatchObject({ operating_company_id: "co", posting_ids: ["p1", "p2", "p3", "p4"], to_load_id: NEW });
    expect(vi.mocked(appendCrudAudit).mock.calls.some((c) => c[2] === repoint.FUEL_RECEIPT_REATTRIBUTED_EVENT
      && (c[3] as Record<string, unknown>).from_load_id === OLD && (c[3] as Record<string, unknown>).load_id === NEW
      && (c[3] as Record<string, unknown>).journal_entry_id === "je-rc")).toBe(true);
    expect(client.calls.some((c) => c.sql.includes("RELEASE SAVEPOINT fuel_receipt_reattribute"))).toBe(true);
  });

  it("leaves a receipt the rule still names in place, and never moves one no load covers (reported)", async () => {
    ruleLoad = { load_id: OLD, load_number: "13658" };
    expect(await repoint.reattributeFuelReceiptsForLoad(fakeClient(attachedOnly) as never, { operatingCompanyId: "co", loadId: OLD, actorUserId: "u1" })).toEqual([]);
    ruleLoad = null;
    const none = await repoint.reattributeFuelReceiptsForLoad(fakeClient(attachedOnly) as never, { operatingCompanyId: "co", loadId: OLD, actorUserId: "u1" });
    expect(none.map((r) => r.outcome)).toEqual(["no_covering_load"]);
    expect(reclassifyCalls).toHaveLength(0);
  });

  it("an engine refusal (closed period) rolls the receipt back and is audited — nothing half-moved", async () => {
    ruleLoad = { load_id: NEW, load_number: "13671" };
    reclassifyResult = { ...okBatch, lines_applied: 0, lines_refused: 4, documents: [{ reclass_journal_entry_id: null, refusal_reason: "period closed for 2026-10-10" }] };
    const client = fakeClient(attachedOnly);
    const out = await repoint.reattributeFuelReceiptsForLoad(client as never, { operatingCompanyId: "co", loadId: NEW, actorUserId: "u1" });
    expect(out[0]).toMatchObject({ outcome: "refused", from_load_id: OLD, load_id: NEW });
    expect(out[0]?.reason).toMatch(/period closed/);
    expect(client.calls.some((c) => c.sql.includes("ROLLBACK TO SAVEPOINT fuel_receipt_reattribute"))).toBe(true);
    expect(vi.mocked(appendCrudAudit).mock.calls.some((c) => c[2] === "fuel.receipt_reattribute_refused")).toBe(true);
  });

  it("a Relay fill whose settlement-entered fuel row names a load follows THAT load; a row on the posted load is left (the document decides, never the rule over it)", async () => {
    ruleLoad = { load_id: "rule-elsewhere", load_number: "99999" };
    const withDoc = (doc: string) => (sql: string) => (sql.includes("WITH live AS") ? [{ ...attachedRow, doc_load_id: doc }] : sql.includes("WITH posted AS") ? [] : sql.includes("SELECT load_number::text AS n") ? [{ n: "13671" }] : null);
    const moved = await repoint.reattributeFuelReceiptsForLoad(fakeClient(withDoc(NEW)) as never, { operatingCompanyId: "co", loadId: NEW, actorUserId: "u1" });
    expect(moved.map((r) => [r.outcome, r.load_id])).toEqual([["reattributed", NEW]]);
    expect(reclassifyCalls[0]).toMatchObject({ to_load_id: NEW });
    expect(String(reclassifyCalls[0]?.reason)).toMatch(/fuel row \(its settlement document\) names load 13671/);
    reclassifyCalls.length = 0;
    expect(await repoint.reattributeFuelReceiptsForLoad(fakeClient(withDoc(OLD)) as never, { operatingCompanyId: "co", loadId: OLD, actorUserId: "u1" })).toEqual([]);
    expect(reclassifyCalls).toHaveLength(0);
  });

  it("dry run plans the move and writes nothing", async () => {
    ruleLoad = { load_id: NEW, load_number: "13671" };
    const out = await repoint.reattributeFuelReceiptsForLoad(fakeClient(attachedOnly) as never, { operatingCompanyId: "co", loadId: null, actorUserId: "u1", dryRun: true });
    expect(out.map((r) => r.outcome)).toEqual(["planned"]);
    expect(reclassifyCalls).toHaveLength(0);
  });
});

describe("Settlement Creator carries a posted receipt to the load it writes the fill's fuel row on (443.192)", () => {
  const legs = (load: string | null) => (sql: string) => (sql.includes("p.source_transaction_id::text = $2") && sql.includes("ORDER BY p.id")
    ? [{ id: "p1", load_id: load }, { id: "p2", load_id: load }] : null);

  it("a receipt on another load moves through the engine", async () => {
    const r = await repoint.carryFuelReceiptToLoad(fakeClient(legs(OLD)) as never, { operatingCompanyId: "co", actorUserId: "u1", fillKind: "relay_fuel", fillId: FILL, toLoadId: NEW, toLoadNumber: "13671", reason: "settlement" });
    expect(r).toBe("reattributed");
    expect(reclassifyCalls[0]).toMatchObject({ posting_ids: ["p1", "p2"], to_load_id: NEW });
  });

  it("a load-less receipt is attached (fill-once), a receipt already there is left alone, an unposted fill is not touched", async () => {
    const nul = fakeClient(legs(null));
    expect(await repoint.carryFuelReceiptToLoad(nul as never, { operatingCompanyId: "co", actorUserId: "u1", fillKind: "relay_fuel", fillId: FILL, toLoadId: NEW, toLoadNumber: "13671", reason: "s" })).toBe("attached");
    expect(nul.calls.some((c) => /UPDATE accounting\.journal_entry_postings\s+SET load_id/.test(c.sql))).toBe(true);
    expect(await repoint.carryFuelReceiptToLoad(fakeClient(legs(NEW)) as never, { operatingCompanyId: "co", actorUserId: "u1", fillKind: "relay_fuel", fillId: FILL, toLoadId: NEW, toLoadNumber: "13671", reason: "s" })).toBe("in_place");
    expect(await repoint.carryFuelReceiptToLoad(fakeClient(() => null) as never, { operatingCompanyId: "co", actorUserId: "u1", fillKind: "relay_fuel", fillId: FILL, toLoadId: NEW, toLoadNumber: "13671", reason: "s" })).toBe("not_posted");
    expect(reclassifyCalls).toHaveLength(0);
  });

  it("a refused move throws (the Creator refuses the settlement by name)", async () => {
    reclassifyResult = { ...okBatch, lines_applied: 0, lines_refused: 2, documents: [{ reclass_journal_entry_id: null, refusal_reason: "period closed" }] };
    await expect(repoint.carryFuelReceiptToLoad(fakeClient(legs(OLD)) as never, { operatingCompanyId: "co", actorUserId: "u1", fillKind: "relay_fuel", fillId: FILL, toLoadId: NEW, toLoadNumber: "13671", reason: "s" }))
      .rejects.toThrow(/fuel_receipt_reattribute_refused: period closed/);
  });
});
