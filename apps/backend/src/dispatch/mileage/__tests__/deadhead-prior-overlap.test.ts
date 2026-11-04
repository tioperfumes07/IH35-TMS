/**
 * Row 131 follow-up (LEAD 11-03, measured on prod): the deadhead engine measured from the unit's previous load's last stop
 * even when the truck's loads overlap. 13687 (Laredo -> Swedesboro, first stop 10-16) took 13672's Swedesboro NJ as its
 * start although 13677 (Vineland NJ -> Temple TX) ran in between: 1,875.6 empty miles written. 13690 the same (13693).
 * Fail-old: before the fix the recommendation returns Google 350.4 and fillLoadDeadhead writes it.
 */
import { describe, expect, it, vi } from "vitest";

const appendCrudAudit = vi.fn();
vi.mock("../../../audit/crud-audit.js", () => ({ appendCrudAudit: (...a: unknown[]) => appendCrudAudit(...a) }));

const CO = "5c854333-6ea5-4faa-af31-67cb272fef80";
const LOAD = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const UNIT = "uuuuuuuu-uuuu-4uuu-8uuu-uuuuuuuuuuuu";
const ACTOR = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const STOPS = [
  { latitude: 27.5, longitude: -99.5, city: "Laredo", state: "TX", postal_code: "78045", at: "2026-10-16T10:00:00Z" },
  { latitude: 39.7, longitude: -75.3, city: "Swedesboro", state: "NJ", postal_code: "08085", at: "2026-10-20T10:00:00Z" },
];

function db(overlap: string | null) {
  const writes: string[] = [];
  let priorSql = "";
  const query = vi.fn(async (sql: string) => {
    if (/FROM catalogs\.lane_mileage/.test(sql)) return { rows: [] };
    if (/FROM catalogs\.point_mileage/.test(sql)) return { rows: [] };
    if (/INSERT INTO catalogs\.point_mileage/.test(sql)) return { rows: [] };
    if (/FROM identity\.users/.test(sql)) return { rows: [] };
    if (/FROM mdata\.loads l\s+JOIN LATERAL/.test(sql)) {
      priorSql = sql;
      return { rows: [{ latitude: 39.7, longitude: -75.3, city: "Swedesboro", state: "NJ", postal_code: "08085", at: "2026-10-16T05:00:00Z", overlap_load: overlap }] };
    }
    if (/FROM mdata\.load_stops s WHERE s\.load_id/.test(sql)) return { rows: STOPS };
    if (/miles_deadhead::text, assigned_unit_id::text AS unit/.test(sql)) return { rows: [{ load_number: "13687", miles_deadhead: null, unit: UNIT }] };
    if (/FROM mdata\.loads/.test(sql)) return { rows: [{ id: LOAD, assigned_unit_id: UNIT, miles_practical: null, miles_shortest: null, miles_deadhead: null, miles_choice: null }] };
    if (/FROM telematics\.vehicle_locations/.test(sql)) return { rows: [{ lat: 27.6, lng: -99.6, captured_at: "2026-10-16T09:00:00Z" }] };
    if (/UPDATE mdata\.loads/.test(sql)) { writes.push(sql); return { rows: [] }; }
    throw new Error(`unhandled ${sql.slice(0, 80)}`);
  });
  return { query, writes, prior: () => priorSql };
}
const route = vi.fn(async () => ({ miles: 1875.6, minutes: 1700 }));

describe("deadhead never measured across overlapping loads of one truck", () => {
  it("the recommendation names the overlapping load instead of a Google distance", async () => {
    const { milesRecommendationsForLoad } = await import("../miles-recommendations.service.js");
    const d = db("13677");
    const r = await milesRecommendationsForLoad(d as never, { operatingCompanyId: CO, loadId: LOAD }, route as never);
    expect(r!.fields.empty.google).toBeNull();
    expect(r!.fields.empty.google_missing_reason).toContain("13677");
    expect(d.prior()).toMatch(/AS overlap_load/);
  });

  it("fillLoadDeadhead writes nothing and does not fall back to the Samsara position", async () => {
    const { fillLoadDeadhead } = await import("../miles-recommendations.service.js");
    const d = db("13677");
    const r = await fillLoadDeadhead(d as never, { operatingCompanyId: CO, loadId: LOAD, actorUserId: ACTOR }, route as never);
    expect(r.status).toBe("not_filled");
    expect(r.reason).toContain("overlap");
    expect(d.writes).toHaveLength(0);
  });

  it("no overlap: the previous last stop is still measured (unchanged behaviour)", async () => {
    const { fillLoadDeadhead } = await import("../miles-recommendations.service.js");
    const d = db(null);
    const r = await fillLoadDeadhead(d as never, { operatingCompanyId: CO, loadId: LOAD, actorUserId: ACTOR }, route as never);
    expect(r).toMatchObject({ status: "filled", miles: 1875.6, method: "google_practical_prev_stop" });
    expect(d.writes).toHaveLength(1);
  });
});
