import ExcelJS from "exceljs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const bookLoadOnClient = vi.fn();
const deliverLoadThroughDispatch = vi.fn();
const stampStopsFromTracking = vi.fn();

vi.mock("./book-load.service.js", () => ({ bookLoadOnClient: (...a: unknown[]) => bookLoadOnClient(...a) }));
vi.mock("../accounting/db-scope.js", () => ({ withCompanyScope: vi.fn() }));
vi.mock("../driver-finance/settlement-creator-deliver.js", () => ({
  deliverLoadThroughDispatch: (...a: unknown[]) => deliverLoadThroughDispatch(...a),
  stampStopsFromTracking: (...a: unknown[]) => stampStopsFromTracking(...a),
  localDayStartIso: (d: string) => `${d}T05:00:00.000Z`,
}));
vi.mock("../driver-finance/settlement-creator-seed-loads.js", () => ({
  findCreatorCustomer: async (_c: unknown, _o: string, l: { customer_name: string }) =>
    l.customer_name === "Ghost Broker" ? { code: "customer_unmatched", message: "not a customer" } : { id: "cust-1" },
}));
vi.mock("../driver-finance/creator-trailer-choice.js", () => ({
  printedTrailerChoice: async (_c: unknown, _o: string, n: string | null) => (n ? { kind: "company", equipment_id: "trl-1" } : null),
  creatorLoadTrailerEquipmentId: async () => "lte-1",
}));

import { LoadHistoryParseError, parseAlwaysTrackLoadHistory, payMiles, splitOrigDest } from "./alwaystrack-load-history-import.js";
import { importAlwaysTrackLoadHistory, loadHistoryPayOverride } from "./alwaystrack-load-history-import.service.js";

const HEADER = ["Load#", "Settl.#", "Enlonado", "Temperatura", "RFC/TAX ID", "Customer", "Invoice", "Invoice Date", "W.O.", "Orig-Dest", "Picks/Drops", "Pickup", "Delivery", "Driver", "Truck#", "Trailer", "Status", "Created By", "St. Miles", "L.Miles", "R.P.M.", "E.Miles", "Driver Pay", "Driver R.P.M", "Driver Addl. Pay", "Driver Reimb. Exp", "Driver Deductions", "Fuel ", "Sales Commission", "Charges", "QP", "Total", "\n    \t\tProfit\n\t\t"];

type R = { load: number; customer: string; wo: string; od: string; pickup: string; delivery: string; driver: string; truck: string; trailer: string; status: string; pay: number; rpm: number; lmi: number; charges: number };

async function workbook(rows: R[], totals?: { count: number; charges: number }): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Worksheet");
  ws.addRow([]);
  ws.addRow([]);
  ws.addRow([]);
  ws.addRow(["LOAD HISTORY"]);
  ws.addRow(["LOADS FROM 2026-10-21 TO 2026-11-09"]);
  ws.addRow(["Invoiced By Test Carrier, LLC"]);
  ws.addRow([]);
  ws.addRow(HEADER);
  for (const r of rows) {
    ws.addRow([r.load, 5855, null, null, null, r.customer, null, null, r.wo, r.od, "1/1", r.pickup, r.delivery, `Primary: ${r.driver}`, `${r.truck}-Own`, r.trailer, r.status, "x", 0, r.lmi, 0, 0, r.pay, r.rpm, 0, 0, 0, 0, 0, r.charges, 0, r.charges, 0]);
  }
  const t = totals ?? { count: rows.length, charges: rows.reduce((a, r) => a + r.charges, 0) };
  const tot: unknown[] = new Array(33).fill(null);
  tot[0] = `(${t.count}) Totals:`;
  tot[29] = t.charges;
  ws.addRow(tot);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const COMPLETED: R = { load: 13701, customer: "Glg II LTD", wo: "164741", od: "Mt Pleasant, TX - Laredo, TX", pickup: "2026-10-23", delivery: "2026-10-26", driver: "HUGO GAYTAN SARABIA", truck: "T148", trailer: "10222 - 53' Reefer", status: "Completed", pay: 295.97, rpm: 0.45, lmi: 544.9, charges: 1445 };
const EXISTING: R = { ...COMPLETED, load: 13690, wo: "FL-13643", od: "MONTE VISTA, CO - HIDALGO, TX", pickup: "2026-10-21", charges: 3600 };
const DISPATCHED: R = { ...COMPLETED, load: 13736, wo: "16655412", od: "LAGNHORNE, PA - SCHERTZ, TX", pickup: "2026-11-09", delivery: "2026-11-12", status: "Dispatched", truck: "T175", charges: 4000 };

function fakeClient(existing: Set<string>) {
  return {
    query: async (sql: string, values: unknown[] = []) => {
      if (sql.includes("FROM org.companies")) return { rows: [{ code: "USMCA" }] };
      if (sql.includes("FROM mdata.loads")) return { rows: existing.has(String(values[1])) ? [{ id: `load-${values[1]}`, rate_total_cents: "300000" }] : [] };
      if (sql.includes("FROM mdata.drivers")) return { rows: [{ id: "drv-hugo", k: "hugogaytan", inactive: false }, { id: "drv-old", k: "hugogaytan", inactive: true }] };
      if (sql.includes("FROM mdata.units")) return { rows: [{ id: `unit-${values[1]}` }] };
      if (sql.includes("driver_pay_rates")) return { rows: [{ basis_type: "per_mile_pay", c: 45 }] };
      throw new Error(`unexpected SQL: ${sql}`);
    },
  };
}

describe("ACCT-F11108 AlwaysTrack LOAD HISTORY parse", () => {
  it("finds the header by content, reads every row and ties to the export's own Totals line", async () => {
    const p = await parseAlwaysTrackLoadHistory(await workbook([COMPLETED, DISPATCHED]));
    expect(p.title).toBe("LOAD HISTORY");
    expect(p.rows.map((r) => r.load_number)).toEqual(["13701", "13736"]);
    expect(p.rows[0]).toMatchObject({ truck_number: "T148", trailer_number: "10222", driver_name: "HUGO GAYTAN SARABIA", charges_cents: 144500, pickup_date: "2026-10-23" });
    expect(p.rows[0]!.origin).toEqual({ city: "Mt Pleasant", state: "TX" });
    expect(p.totals.charges_cents).toBe(544500);
  });

  it("refuses a file whose rows do not sum to its Totals line (never trusts a partial read)", async () => {
    await expect(parseAlwaysTrackLoadHistory(await workbook([COMPLETED], { count: 1, charges: 9999 }))).rejects.toBeInstanceOf(LoadHistoryParseError);
    await expect(parseAlwaysTrackLoadHistory(await workbook([COMPLETED], { count: 2, charges: 1445 }))).rejects.toMatchObject({ code: "totals_count_mismatch" });
  });

  it("splits Orig-Dest and computes AT's paid short miles", () => {
    expect(splitOrigDest("Nuevo Laredo, Tam. - QUAKERTOWN, PA")).toEqual({ origin: { city: "Nuevo Laredo", state: "TAM" }, destination: { city: "Quakertown", state: "PA" } });
    expect(payMiles({ driver_pay: 492.8, driver_rpm: 0.45 })).toBe(1095.1);
    expect(payMiles({ driver_pay: 0, driver_rpm: 0 })).toBeNull();
  });

  it("overrides the card only when AlwaysTrack paid a different rate, or $0 on a completed load", () => {
    expect(loadHistoryPayOverride({ load_number: "1", driver_pay: 100, driver_rpm: 0.45 }, "deliver", 45)).toBeNull();
    expect(loadHistoryPayOverride({ load_number: "1", driver_pay: 100, driver_rpm: 0.5 }, "deliver", 45)).toMatchObject({ driver_pay_rate_per_mile: 0.5 });
    expect(loadHistoryPayOverride({ load_number: "1", driver_pay: 0, driver_rpm: 0 }, "deliver", 50)).toMatchObject({ driver_pay_rate_per_mile: 0 });
    expect(loadHistoryPayOverride({ load_number: "1", driver_pay: 0, driver_rpm: 0 }, "dispatch", 50)).toBeNull();
  });
});

describe("ACCT-F11108 AlwaysTrack LOAD HISTORY import", () => {
  beforeEach(() => {
    bookLoadOnClient.mockReset().mockImplementation(async (_c: unknown, input: { requested_load_number: string }) => ({
      result: { kind: "ok", row: { id: `new-${input.requested_load_number}` } },
      afterCommit: () => {},
    }));
    deliverLoadThroughDispatch.mockReset().mockResolvedValue(undefined);
    stampStopsFromTracking.mockReset().mockResolvedValue([]);
  });

  const run = async (rows: R[], commit: boolean, existing = new Set<string>(), sourceCompanyCode = "USMCA") =>
    importAlwaysTrackLoadHistory({
      actor: { uuid: "00000000-0000-4000-8000-000000000009", role: "Owner" },
      operatingCompanyId: "5c854333-6ea5-4faa-af31-67cb272fef80",
      sourceCompanyCode,
      buffer: await workbook(rows),
      commit,
      scope: (fn) => fn(fakeClient(existing) as never),
    });

  it("books only the delta: an existing load number is skipped, a Completed load is booked historical_backfill and delivered", async () => {
    const out = await run([EXISTING, COMPLETED, DISPATCHED], true, new Set(["13690"]));
    expect(out.skipped_existing).toEqual({ count: 1, charges_cents: 360000 });
    expect(out.booked).toEqual({ count: 2, charges_cents: 544500 });
    expect(bookLoadOnClient).toHaveBeenCalledTimes(2);
    for (const call of bookLoadOnClient.mock.calls) expect(call[2]).toEqual({ source: "historical_backfill" });
    const first = bookLoadOnClient.mock.calls[0]![1] as Record<string, unknown>;
    expect(first).toMatchObject({ requested_load_number: "13701", assigned_primary_driver_id: "drv-hugo", miles_shortest: 657.7, miles_practical: 544.9, customer_wo_number: "164741" });
    expect(first).not.toHaveProperty("driver_pay_rate_per_mile");
    expect(deliverLoadThroughDispatch).toHaveBeenCalledTimes(1);
    expect(deliverLoadThroughDispatch.mock.calls[0]![3]).toBe("new-13701");
    expect(out.rows.find((r) => r.load_number === "13736")!.outcome).toBe("booked_dispatched");
  });

  it("preview writes nothing", async () => {
    const out = await run([COMPLETED], false);
    expect(out.rows[0]!.outcome).toBe("would_book_delivered");
    expect(bookLoadOnClient).not.toHaveBeenCalled();
    expect(deliverLoadThroughDispatch).not.toHaveBeenCalled();
  });

  it("refuses a customer the company does not have by name, and keeps going", async () => {
    const out = await run([{ ...COMPLETED, customer: "Ghost Broker" }, DISPATCHED], true);
    expect(out.refused.count).toBe(1);
    expect(out.rows.find((r) => r.load_number === "13701")!.refusal!.code).toBe("customer_unmatched");
    expect(bookLoadOnClient).toHaveBeenCalledTimes(1);
  });

  it("refuses an export named for another company", async () => {
    await expect(run([COMPLETED], true, new Set(), "TRANSP")).rejects.toMatchObject({ code: "inbound_load_entity_mismatch" });
    expect(bookLoadOnClient).not.toHaveBeenCalled();
  });
});
