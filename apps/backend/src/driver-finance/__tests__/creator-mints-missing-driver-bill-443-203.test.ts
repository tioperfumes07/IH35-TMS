import { describe, expect, it, vi } from "vitest";

vi.mock("../driver-bill-unit-trailer.js", () => ({ restampDriverBillUnitAndTrailer: vi.fn(async () => undefined) }));

const { restateOpenDriverBillToSignedPay } = await import("../settlement-creator.service.js");

// LEAD 443.203 (17:05Z): settlement 5849 / load 13684 — an adopted load with NO live driver bill made the invoice gate red
// ("no live driver bill for this load"); the restate returned early and never minted. Fails on the old engine (no INSERT).
const input = {
  companyId: "co", loadId: "ld", loadNumber: "13684", actorUserId: "u", settlementNo: "5849",
  milesBasis: 1000, rateCents: 50, loadedCents: 50000, emptyMiles: null, emptyRateCents: null, emptyCents: 0,
};

function client(bills: unknown[], driver: string | null = "drv") {
  const sql: string[] = [];
  return {
    sql,
    query: vi.fn(async (q: string) => {
      sql.push(q);
      if (/FROM driver_finance\.driver_bills\s+WHERE operating_company_id/.test(q)) return { rows: bills };
      if (/FROM mdata\.loads WHERE id/.test(q)) return { rows: driver ? [{ driver, team: null }] : [{ driver: null, team: null }] };
      return { rows: [] };
    }),
  };
}

describe("443.203 — the signed settlement mints the missing driver bill of an adopted load", () => {
  it("no live bill → one bill INSERT at the signed pay for the load's own driver", async () => {
    const c = client([]);
    await restateOpenDriverBillToSignedPay(c as never, input);
    const ins = c.query.mock.calls.filter((x) => /INSERT INTO driver_finance\.driver_bills/.test(String(x[0])));
    expect(ins).toHaveLength(1);
    const v = ins[0]![1] as unknown[];
    expect(v[3]).toBe("13684");
    expect(v[4]).toBe("drv");
    expect(v[6]).toBe(50000);
  });
  it("no driver on the load → refused by name, nothing written", async () => {
    const c = client([], null);
    await expect(restateOpenDriverBillToSignedPay(c as never, input)).rejects.toThrow(/driver bill|no driver/);
    expect(c.sql.some((q) => /INSERT INTO driver_finance\.driver_bills/.test(q))).toBe(false);
  });
  it("a bill already equal to the signed pay is left alone", async () => {
    const c = client([{ id: "b1", gross: "50000", driver_id: "drv", team_driver_id: null }]);
    await restateOpenDriverBillToSignedPay(c as never, input);
    expect(c.sql.some((q) => /INSERT INTO driver_finance\.driver_bills/.test(q))).toBe(false);
  });
});
