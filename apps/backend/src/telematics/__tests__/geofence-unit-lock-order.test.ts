import { describe, expect, it } from "vitest";
import { processGeofenceDetectionsForGpsPoint } from "../geofence-detector.service.js";
import { compareUnitLockKey, sortForUnitLockOrder } from "../unit-lock-order.js";

// TELEMATICS-DEADLOCK-01 (Render 2026-11-02 20:25:46Z / 20:26:40Z, 40P01 on advisory locks): batch callers walked fixes in
// time order across units and locked (fence, unit) per transition, so two transactions took locks in opposite orders.
describe("geofence fence-lock order (TELEMATICS-DEADLOCK-01)", () => {
  const A = "0b7d2c1e-0000-4000-8000-000000000001";
  const B = "9f00aa11-0000-4000-8000-000000000002";

  it("orders unit-major then chronological, regardless of input order (two callers → one global order)", () => {
    const fixes = [
      { unit: B, at: "2026-11-02T10:00:00Z" },
      { unit: A, at: "2026-11-02T12:00:00Z" },
      { unit: B, at: "2026-11-02T09:00:00Z" },
      { unit: A, at: "2026-11-02T08:00:00Z" },
    ];
    const one = sortForUnitLockOrder(fixes, (f) => f.unit, (f) => f.at);
    const two = sortForUnitLockOrder([...fixes].reverse(), (f) => f.unit, (f) => f.at);
    expect(one.map((f) => `${f.unit}@${f.at}`)).toEqual(two.map((f) => `${f.unit}@${f.at}`));
    expect(one.map((f) => f.unit)).toEqual([A, A, B, B]);
    expect(one.map((f) => f.at)).toEqual(["2026-11-02T08:00:00Z", "2026-11-02T12:00:00Z", "2026-11-02T09:00:00Z", "2026-11-02T10:00:00Z"]);
  });

  it("compares uuids by byte order (= Postgres uuid ORDER BY), never locale order", () => {
    const ids = ["a-b", "ab", "a0"]; // ICU localeCompare ignores '-', byte order does not
    expect([...ids].sort(compareUnitLockKey)).toEqual(["a-b", "a0", "ab"]);
    expect(compareUnitLockKey(A.toUpperCase(), A)).toBe(0);
  });

  it("takes exactly ONE advisory lock per call, keyed by unit, before any fence work", async () => {
    const locks: string[] = [];
    const client = {
      query: async (sql: string, params: unknown[] = []) => {
        if (sql.includes("pg_advisory_xact_lock")) {
          locks.push(String(params[0]));
          return { rows: [], rowCount: 0 };
        }
        if (/FROM geo\.geofences/.test(sql) && /vertices_json/.test(sql)) {
          return {
            rows: ["f1", "f2", "f3"].map((id) => ({
              geofence_id: id,
              vertices_json: [{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }, { lat: 1, lng: 1 }, { lat: 1, lng: 0 }],
              last_event_kind: null,
            })),
            rowCount: 3,
          };
        }
        return { rows: [], rowCount: 0 };
      },
    };
    await processGeofenceDetectionsForGpsPoint(client as never, {
      operating_company_id: "5c854333-6ea5-4faa-af31-67cb272fef80",
      unit_id: A,
      driver_id: "d0000000-0000-4000-8000-000000000000",
      latitude: 0.5,
      longitude: 0.5,
      occurred_at: "2026-11-02T10:00:00Z",
    } as never);
    expect(locks).toEqual([`geo.fence_transition_unit:${A}`]);
  });
});
