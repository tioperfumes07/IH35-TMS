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

import { emptyPayMiles, loadedPayMiles, LoadHistoryParseError, parseAlwaysTrackLoadHistory, payMiles, splitOrigDest } from "./alwaystrack-load-history-import.js";
import { importAlwaysTrackLoadHistory, loadHistoryPayOverride } from "./alwaystrack-load-history-import.service.js";

const HEADER = ["Load#", "Settl.#", "Enlonado", "Temperatura", "RFC/TAX ID", "Customer", "Invoice", "Invoice Date", "W.O.", "Orig-Dest", "Picks/Drops", "Pickup", "Delivery", "Driver", "Truck#", "Trailer", "Status", "Created By", "St. Miles", "L.Miles", "R.P.M.", "E.Miles", "Driver Pay", "Driver R.P.M", "Driver Addl. Pay", "Driver Reimb. Exp", "Driver Deductions", "Fuel ", "Sales Commission", "Charges", "QP", "Total", "\n    \t\tProfit\n\t\t"];

type R = { load: number; customer: string; wo: string; od: string; pickup: string; delivery: string; driver: string; truck: string; trailer: string; status: string; pay: number; rpm: number; lmi: number; emi?: number; charges: number };

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
    ws.addRow([r.load, 5855, null, null, null, r.customer, null, null, r.wo, r.od, "1/1", r.pickup, r.delivery, `Primary: ${r.driver}`, `${r.truck}-Own`, r.trailer, r.status, "x", 0, r.lmi, 0, r.emi ?? 0, r.pay, r.rpm, 0, 0, 0, 0, 0, r.charges, 0, r.charges, 0]);
  }
  const t = totals ?? { count: rows.length, charges: rows.reduce((a, r) => a + r.charges, 0) };
  const tot: unknown[] = new Array(33).fill(null);
  tot[0] = `(${t.count}) Totals:`;
  tot[29] = t.charges;
  ws.addRow(tot);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const COMPLETED: R = { load: 13701, customer: "Glg II LTD", wo: "164741", od: "Mt Pleasant, TX - Laredo, TX", pickup: "2026-10-23", delivery: "2026-10-26", driver: "HUGO GAYTAN SARABIA", truck: "T148", trailer: "10222 - 53' Reefer", status: "Completed", pay: 295.97, rpm: 0.45, lmi: 544.9, emi: 137.4, charges: 1445 };
const EXISTING: R = { ...COMPLETED, load: 13690, wo: "FL-13643", od: "MONTE VISTA, CO - HIDALGO, TX", pickup: "2026-10-21", charges: 3600 };
const DISPATCHED: R = { ...COMPLETED, load: 13736, wo: "16655412", od: "LAGNHORNE, PA - SCHERTZ, TX", pickup: "2026-11-09", delivery: "2026-11-12", status: "Dispatched", truck: "T175", charges: 4000 };

let openTrip: { id: string; display_id: string; loads: string; in_motion: boolean } | null = null;
let proposedExpenses: Array<{ expense_id: string; expense_number: string; load_id: string; total_cents: string }> = [];

function fakeClient(existing: Set<string>) {
  return {
    query: async (sql: string, values: unknown[] = []) => {
      if (sql.includes("FROM org.companies")) return { rows: [{ code: "USMCA" }] };
      if (sql.includes("FROM driver_finance.driver_settlements s")) return { rows: openTrip && values[1] === "drv-hugo" ? [openTrip] : [] };
      if (sql.includes("load_confirmation = 'proposed'")) return { rows: proposedExpenses };
      if (sql.includes("FROM mdata.loads")) return { rows: existing.has(String(values[1])) ? [{ id: `load-${values[1]}`, rate_total_cents: "300000" }] : [] };
      if (sql.includes("FROM mdata.drivers")) return { rows: [{ id: "drv-hugo", k: "hugogaytan", inactive: false }, { id: "drv-old", k: "hugogaytan", inactive: true }] };
      if (sql.includes("FROM mdata.units")) return { rows: [{ id: `unit-${values[1]}` }] };
      if (sql.includes("driver_pay_rates")) return { rows: [{ basis_type: "per_mile_pay", c: 45, e: null }] };
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
    const card = (loadedCents: number, emptyCents: number | null = null) => ({ loadedCents, emptyCents });
    expect(loadHistoryPayOverride({ load_number: "1", driver_pay: 100, driver_rpm: 0.45 }, "deliver", card(45))).toBeNull();
    expect(loadHistoryPayOverride({ load_number: "1", driver_pay: 100, driver_rpm: 0.5 }, "deliver", card(45))).toMatchObject({ driver_pay_rate_per_mile: 0.5 });
    expect(loadHistoryPayOverride({ load_number: "1", driver_pay: 0, driver_rpm: 0 }, "deliver", card(50))).toMatchObject({ driver_pay_rate_per_mile: 0 });
    expect(loadHistoryPayOverride({ load_number: "1", driver_pay: 0, driver_rpm: 0 }, "dispatch", card(50))).toBeNull();
    // AT paid one rate for both legs: a card whose EMPTY rate differs is overridden when the load has empty miles.
    expect(loadHistoryPayOverride({ load_number: "1", driver_pay: 100, driver_rpm: 0.45, e_miles: 50 }, "deliver", card(45, 30))).toMatchObject({ driver_pay_rate_per_mile: 0.45 });
    expect(loadHistoryPayOverride({ load_number: "1", driver_pay: 100, driver_rpm: 0.45, e_miles: 0 }, "deliver", card(45, 30))).toBeNull();
  });

  it("splits AT's paid miles into short LOADED miles and E.Miles deadhead — same total pay (real rows 13701, 13730)", () => {
    // 13701: Driver Pay 295.97 @ 0.45 = 657.7 paid miles; L.Miles 544.9; E.Miles 137.4.
    const r13701 = { driver_pay: 295.97, driver_rpm: 0.45, e_miles: 137.4 };
    expect(payMiles(r13701)).toBe(657.7);
    expect(loadedPayMiles(r13701)).toBe(520.3);
    expect(emptyPayMiles(r13701)).toBe(137.4);
    expect(loadedPayMiles(r13701)! <= 544.9).toBe(true);
    // 13730: 677.61 @ 0.45 = 1505.8; L.Miles 1002.4; E.Miles 532.3.
    const r13730 = { driver_pay: 677.61, driver_rpm: 0.45, e_miles: 532.3 };
    expect(loadedPayMiles(r13730)).toBe(973.5);
    expect(Math.round((loadedPayMiles(r13730)! + emptyPayMiles(r13730)!) * 45)).toBe(Math.round(1505.8 * 45));
    // No empty miles: loaded = paid, no deadhead. No pay: neither.
    expect(loadedPayMiles({ driver_pay: 492.8, driver_rpm: 0.45, e_miles: 0 })).toBe(1095.1);
    expect(emptyPayMiles({ driver_pay: 492.8, driver_rpm: 0.45, e_miles: 0 })).toBeNull();
    expect(emptyPayMiles({ driver_pay: 0, driver_rpm: 0, e_miles: 40 })).toBeNull();
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
    openTrip = null;
    proposedExpenses = [];
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
    expect(first).toMatchObject({ requested_load_number: "13701", assigned_primary_driver_id: "drv-hugo", miles_shortest: 520.3, miles_deadhead: 137.4, miles_practical: 544.9, customer_wo_number: "164741" });
    expect(first).not.toHaveProperty("driver_pay_rate_per_mile");
    expect(deliverLoadThroughDispatch).toHaveBeenCalledTimes(1);
    expect(deliverLoadThroughDispatch.mock.calls[0]![3]).toBe("new-13701");
    expect(out.rows.find((r) => r.load_number === "13736")!.outcome).toBe("booked_dispatched");
  });

  it("preview refuses what the database would refuse: loaded pay miles over L.Miles (loads_miles_shortest_not_over_practical)", async () => {
    const out = await run([{ ...COMPLETED, emi: 0 }], false);
    expect(out.rows[0]!.outcome).toBe("refused");
    expect(out.rows[0]!.refusal!.code).toBe("pay_miles_over_practical");
    expect(bookLoadOnClient).not.toHaveBeenCalled();
  });

  it("preview writes nothing", async () => {
    const out = await run([COMPLETED], false);
    expect(out.rows[0]!.outcome).toBe("would_book_delivered");
    expect(bookLoadOnClient).not.toHaveBeenCalled();
    expect(deliverLoadThroughDispatch).not.toHaveBeenCalled();
  });

  it("refuses a customer the company does not have by name, and keeps going", async () => {
    const out = await run([{ ...COMPLETED, customer: "Ghost Broker" }, { ...COMPLETED, load: 13738, wo: "X2", pickup: "2026-10-27", delivery: "2026-10-28" }], true);
    expect(out.refused.count).toBe(1);
    expect(out.rows.find((r) => r.load_number === "13701")!.refusal!.code).toBe("customer_unmatched");
    expect(bookLoadOnClient).toHaveBeenCalledTimes(1);
  });

  it("preview refuses a new trip while the driver's current trip is open (uq_driver_settlements_one_open_per_driver), naming it — real 13701 / P-0114", async () => {
    openTrip = { id: "s-114", display_id: "P-0114", loads: "13688 delivered_pending_docs, 13694 delivered_pending_docs", in_motion: false };
    proposedExpenses = [{ expense_id: "e1", expense_number: "13694", load_id: "l1", total_cents: "100" }];
    for (const commit of [false, true]) {
      bookLoadOnClient.mockClear();
      const out = await run([COMPLETED], commit);
      expect(out.rows[0]!.outcome).toBe("refused");
      expect(out.rows[0]!.refusal!.code).toBe("driver_trip_open");
      expect(out.rows[0]!.refusal!.message).toContain("P-0114");
      expect(out.rows[0]!.refusal!.message).toContain("OWNER RULING 443.288");
      expect(bookLoadOnClient).not.toHaveBeenCalled();
    }
    openTrip = { id: "s-128", display_id: "P-0128", loads: "13727 dispatched", in_motion: true };
    const out = await run([COMPLETED], false);
    expect(out.rows[0]!.refusal!.message).toContain("still in motion");
  });

  it("never books a later in-motion load ahead of an earlier refused load of the same driver or truck (real 13708 -> 13727)", async () => {
    const out = await run([{ ...COMPLETED, customer: "Ghost Broker" }, DISPATCHED, { ...DISPATCHED, load: 13737, truck: "T148", driver: "Nobody Known", wo: "X1" }], true);
    expect(out.rows.find((r) => r.load_number === "13701")!.refusal!.code).toBe("customer_unmatched");
    // 13736 is Hugo's (same driver) -> held; 13737 is on T148 (same truck) -> held.
    expect(out.rows.find((r) => r.load_number === "13736")!.refusal!.code).toBe("earlier_load_refused");
    expect(out.rows.find((r) => r.load_number === "13737")!.refusal!.code).toBe("earlier_load_refused");
    expect(bookLoadOnClient).not.toHaveBeenCalled();
    // A later COMPLETED row is delivered in its own transaction and still books.
    const out2 = await run([{ ...COMPLETED, customer: "Ghost Broker" }, { ...COMPLETED, load: 13738, wo: "X2", pickup: "2026-10-27", delivery: "2026-10-28" }], true);
    expect(out2.rows.find((r) => r.load_number === "13738")!.outcome).toBe("booked_delivered");
  });

  it("refuses an export named for another company", async () => {
    await expect(run([COMPLETED], true, new Set(), "TRANSP")).rejects.toMatchObject({ code: "inbound_load_entity_mismatch" });
    expect(bookLoadOnClient).not.toHaveBeenCalled();
  });
});
