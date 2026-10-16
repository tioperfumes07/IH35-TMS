/**
 * LEAD 443.167-R — fail-old: a load the seed booked first (its per-load shell voided "regrouped") could not be paid by
 * its signed settlement ("Settlement Creator only books NEW load numbers"), and its proforma driver bill, priced from
 * the seed's miles, broke the close (gross ≠ Σ driver bills). Synthetic ids only.
 */
import { describe, expect, it, vi } from "vitest";
import { isSeededLoadFreeForThisSettlement } from "../settlement-creator-seed-loads.js";
import { restateOpenDriverBillToSignedPay } from "../settlement-creator.service.js";

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
