/**
 * LEAD 443.167-R — fail-old: a load the seed booked first (its per-load shell voided "regrouped") could not be paid by
 * its signed settlement ("Settlement Creator only books NEW load numbers"), and its proforma driver bill, priced from
 * the seed's miles, broke the close (gross ≠ Σ driver bills). Synthetic ids only.
 */
import { describe, expect, it, vi } from "vitest";
import { ensureDispatchedLoadsForCreator, isSeededLoadFreeForThisSettlement } from "../settlement-creator-seed-loads.js";
import { restateOpenDriverBillToSignedPay } from "../settlement-creator.service.js";
import { bookLoadOnClient } from "../../dispatch/book-load.service.js";
import { deliverLoadThroughDispatch, stampStopsFromTracking } from "../settlement-creator-deliver.js";
vi.mock("../../dispatch/book-load.service.js", async orig => ({ ...(await orig()), bookLoadOnClient: vi.fn() }));
vi.mock("../settlement-creator-deliver.js", async orig => ({ ...(await orig()), stampStopsFromTracking: vi.fn(async () => []), deliverLoadThroughDispatch: vi.fn() }));
vi.mock("../creator-trailer-choice.js", async orig => ({ ...(await orig()), creatorTrailerChoice: vi.fn(async () => ({ kind: "none" })), creatorLoadTrailerChoice: vi.fn(async () => ({ kind: "none" })), creatorLoadTrailerEquipmentId: vi.fn(async () => "equipment-type") }));

const draft = { operating_company_id: "co", settlement_no: "5839", driver_id: "drv" } as never;

describe("isSeededLoadFreeForThisSettlement", () => {
  it("asks for this driver's live load on no live settlement other than this document's", async () => {
    const query = vi.fn(async () => ({ rows: [{ ok: true }] }));
    expect(await isSeededLoadFreeForThisSettlement({ query } as never, draft, "load-1")).toBe(true);
    const [sql, values] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toMatch(/assigned_primary_driver_id = \$3::uuid/);
    expect(sql).toMatch(/s\.voided_at IS NULL AND s\.status <> 'cancelled'/);
    expect(values).toEqual(["co", "load-1", "drv", "5839"]);
  });
});

describe("443.200: complete an adopted signed leg before booking the next leg", () => {
  async function run({ completed = true, eligible = true, accrued = false } = {}) {
    const order: string[] = [];
    let active = true;
    vi.mocked(stampStopsFromTracking).mockClear();
    vi.mocked(deliverLoadThroughDispatch).mockImplementation(async () => { order.push("deliver"); active = false; });
    vi.mocked(bookLoadOnClient).mockImplementation(async () => {
      order.push("book");
      if (active) throw new Error("unit is already active on load prior");
      return { result: { kind: "ok", row: { id: "next" } }, afterCommit: () => {} } as never;
    });
    const query = vi.fn(async (sql: string, values: unknown[] = []) => {
      if (/SELECT id::text FROM mdata.loads/.test(sql)) return { rows: values[1] === "prior" ? [{ id: "prior-id" }] : [] };
      if (/SELECT EXISTS/.test(sql)) return { rows: [{ ok: eligible }] };
      if (/FROM driver_finance.driver_bills\s+WHERE operating_company_id/.test(sql)) return { rows: [{ id: "bill", gross: "400", driver_id: "drv", team_driver_id: null }] };
      if (/AS settled/.test(sql)) return { rows: [{ status: "open", settled: null, accrued: accrued ? "accrual" : null }] };
      if (/INSERT INTO driver_finance.driver_bills/.test(sql)) order.push("restate");
      if (/FROM mdata.customers/.test(sql)) return { rows: [{ id: "customer" }] };
      return { rows: [] };
    });
    const common = { miles_shortest: 10, loaded_miles: 12, line_haul_rate_cents: 45, line_haul_amount_cents: 1000 };
    const input = { operating_company_id: "co", driver_id: "drv", unit_id: "unit", settlement_no: "synthetic",
      loads: [{ ...common, load_number: "prior", not_yet_delivered: !completed, delivery_date: completed ? "2026-10-15" : null },
        { ...common, load_number: "next", not_yet_delivered: true, customer_id: "customer", customer_wo_number: "wo", pickup_city: "Laredo", pickup_state: "TX", delivery_city: "Waco", delivery_state: "TX" }] };
    const result = ensureDispatchedLoadsForCreator({ query } as never, { uuid: "actor", role: "Owner" }, input as never);
    return { result, order, query };
  }
  it("restates before delivery and frees only the adopted leg before the next booking (fails old)", async () => {
    const { result, order } = await run();
    await expect(result).resolves.toMatchObject({ created_load_numbers: ["next"] });
    expect(order).toEqual(["restate", "deliver", "book"]);
    expect(deliverLoadThroughDispatch).toHaveBeenLastCalledWith(expect.anything(), "actor", "co", "prior-id", "2026-10-15");
  });
  it("does not deliver an unfinished adopted leg to bypass the active-unit refusal", async () => {
    const { result, order } = await run({ completed: false });
    await expect(result).rejects.toThrow("unit is already active");
    expect(order).toEqual(["book"]);
  });
  it("does not touch a load that fails the existing adoption eligibility rule", async () => {
    const { result, order } = await run({ eligible: false });
    await expect(result).rejects.toThrow("only books NEW load numbers");
    expect(order).toEqual([]);
  });
  it("refuses accrued mismatched pay before delivering or booking anything", async () => {
    const { result, order } = await run({ accrued: true });
    await expect(result).rejects.toThrow("accrued at delivery");
    expect(order).toEqual([]);
  });
});

function client(bill: { gross: string; status?: string; settled?: string | null; accrued?: string | null } | null) {
  const calls: Array<[string, unknown[]]> = [];
  const query = vi.fn(async (sql: string, values: unknown[] = []) => {
    calls.push([sql, values]);
    if (/FROM driver_finance\.driver_bills\s+WHERE operating_company_id/.test(sql)) return { rows: bill ? [{ id: "b1", gross: bill.gross, driver_id: "drv", team_driver_id: null }] : [] };
    if (/AS settled/.test(sql)) return { rows: [{ status: bill?.status ?? "open", settled: bill?.settled ?? null, accrued: bill?.accrued ?? null }] };
    return { rows: [] };
  });
  return { query, calls };
}
const base = { companyId: "co", loadId: "load-1", loadNumber: "13655", actorUserId: "u", settlementNo: "5839", milesBasis: 1339.1, rateCents: 45, loadedCents: 60260, emptyMiles: null, emptyRateCents: null, emptyCents: 0 };

describe("restateOpenDriverBillToSignedPay", () => {
  it("voids a proforma bill priced off the seed and mints one -R bill at the signed pay", async () => {
    const c = client({ gross: "60917" });
    await restateOpenDriverBillToSignedPay(c as never, base);
    const sqls = c.calls.map(([s]) => s).join("\n");
    expect(sqls).toMatch(/SET status = 'void'/);
    const ins = c.calls.find(([s]) => /INSERT INTO driver_finance\.driver_bills/.test(s))!;
    expect(ins[1].slice(0, 8)).toEqual(["co", "load-1", "13655", "13655-R", "drv", null, 60260, 1339.1]);
    expect(sqls).not.toMatch(/DELETE/);
  });
  it("leaves a bill that already equals the signed pay alone", async () => {
    const c = client({ gross: "60260" });
    await restateOpenDriverBillToSignedPay(c as never, base);
    expect(c.calls.some(([s]) => /UPDATE|INSERT/.test(s))).toBe(false);
  });
  it("refuses a bill settled in a live settlement or accrued at delivery", async () => {
    await expect(restateOpenDriverBillToSignedPay(client({ gross: "60917", settled: "s-live" }) as never, base)).rejects.toThrow(/already settled/);
    await expect(restateOpenDriverBillToSignedPay(client({ gross: "60917", accrued: "ab" }) as never, base)).rejects.toThrow(/accrued at delivery/);
  });
});

// LEAD 443.167-R2 — owner standing ruling: a Transportation load tied to a USMCA settlement settles here at $0.
vi.mock("../../accounting/journal-entries.service.js", async (orig) => ({ ...(await orig()), reverseJournalEntryNoFlip: vi.fn(async () => ({})) }));
vi.mock("../../audit/crud-audit.js", async (orig) => ({ ...(await orig()), appendCrudAudit: vi.fn(async () => undefined) }));
import { restateAdoptedLoadToZeroRevenue } from "../settlement-creator.service.js";
import { reverseJournalEntryNoFlip } from "../../accounting/journal-entries.service.js";

function zclient(rate: string, invoices: number, earn: string[]) {
  const calls: Array<[string, unknown[]]> = [];
  const query = vi.fn(async (sql: string, values: unknown[] = []) => {
    calls.push([sql, values]);
    if (/rate_total_cents::text AS r/.test(sql)) return { rows: [{ r: rate }] };
    if (/FROM accounting\.invoices/.test(sql)) return { rows: [{ n: invoices }] };
    if (/source_transaction_type = 'load'/.test(sql)) return { rows: earn.map((je) => ({ je })) };
    return { rows: [] };
  });
  return { query, calls };
}
const z = { companyId: "co", loadId: "l-13541", loadNumber: "13541", actorUserId: "u", settlementNo: "5796" };

describe("restateAdoptedLoadToZeroRevenue (13541 / 5796 shape)", () => {
  it("reverses the seed's Event 1 earn, zeroes the charge lines and the rate", async () => {
    const c = zclient("250000", 0, ["je-earn"]);
    await restateAdoptedLoadToZeroRevenue(c as never, z);
    expect(reverseJournalEntryNoFlip).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ journalEntryId: "je-earn" }));
    const sqls = c.calls.map(([s]) => s).join("\n");
    expect(sqls).toMatch(/UPDATE dispatch\.load_charge_lines SET amount_cents = 0/);
    expect(sqls).toMatch(/UPDATE mdata\.loads SET rate_total_cents = 0/);
    expect(sqls).not.toMatch(/DELETE/);
  });
  it("is a no-op for a load already at $0", async () => {
    const c = zclient("0", 0, []);
    await restateAdoptedLoadToZeroRevenue(c as never, z);
    expect(c.calls.length).toBe(1);
  });
  it("refuses a load that already has a live invoice", async () => {
    await expect(restateAdoptedLoadToZeroRevenue(zclient("250000", 1, []) as never, z)).rejects.toThrow(/already has a live invoice/);
  });
});
