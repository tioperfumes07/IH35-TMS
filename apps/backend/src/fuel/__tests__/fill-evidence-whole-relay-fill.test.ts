// LEAD 443.230 — a Relay fill's rows (diesel + DEF) move together, so the engine's evidence (truck / load resolution, GPS truck,
// moment) is written on every row of the fill. Measured 10-22: 7 sibling rows moved by the 443.214 apply carried no resolution,
// so verify-fuel-transactions-per-load named them "unsourced". Main: the UPDATE targets the called row only.
import { describe, expect, it, vi } from "vitest";
vi.mock("../../audit/crud-audit.js", () => ({ appendCrudAudit: vi.fn(async () => undefined) }));
import { applyFillTruckAndLoad } from "../fill-truck-and-load.service.js";

describe("fill evidence covers the whole Relay fill (443.230)", () => {
  it("the evidence UPDATE reaches every live row of the fill's Relay transaction", async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const client = { query: vi.fn(async (sql: string, params: unknown[] = []) => { calls.push({ sql, params }); return { rows: [], rowCount: 1 }; }) };
    await applyFillTruckAndLoad(client as never, {
      companyId: "co", actorUserId: "u", fuelId: "fuel-diesel", toLoadId: null, toLoadNumber: null, toUnitId: "t173", reason: "test",
      resolution: { moment: "2026-09-25T15:00:00Z", moment_source: "relay", station_lat: null, station_lng: null, card_unit_id: "t173",
        candidates: [], truck_resolution: "gps", load_resolution: "running", load_id: "l1", relay_id: "relay-1" } as never,
    });
    const upd = calls.find((c) => /UPDATE fuel\.fuel_transactions/.test(c.sql));
    expect(upd, "the evidence UPDATE runs").toBeTruthy();
    expect(upd!.sql).toMatch(/relay_fuel_transaction_id = \$14::uuid/);
    expect(upd!.params[13]).toBe("relay-1");
  });
});
