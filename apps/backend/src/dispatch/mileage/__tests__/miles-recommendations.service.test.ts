import { describe, expect, it, vi } from "vitest";

const appendCrudAudit = vi.fn();
vi.mock("../../../audit/crud-audit.js", () => ({ appendCrudAudit: (...a: unknown[]) => appendCrudAudit(...a) }));

const CO = "5c854333-6ea5-4faa-af31-67cb272fef80";
const LOAD = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const UNIT = "uuuuuuuu-uuuu-4uuu-8uuu-uuuuuuuuuuuu";
const ACTOR = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const LANE = {
  practical_miles: "500.0", short_miles: "470.0", empty_miles: "40.0", n_practical: 12, n_short: 9, practical_min: "480", practical_max: "520",
  short_min: "460", short_max: "480", last_seen: "2026-09-30", confidence: "High", autofill_allowed: true, short_miles_untrustworthy: false, short_miles_untrustworthy_reason: null,
};
const STOPS = [
  { latitude: 27.5, longitude: -99.5, city: "Laredo", state: "TX", postal_code: "78045", at: "2026-10-01T10:00:00Z" },
  { latitude: 29.7, longitude: -95.3, city: "Houston", state: "TX", postal_code: "77051", at: "2026-10-02T10:00:00Z" },
];

function db(opts: { lane?: boolean; choice?: Record<string, unknown> | null } = {}) {
  const state = { miles_practical: "505.0", miles_shortest: "471.0", miles_deadhead: "38.0", miles_choice: opts.choice ?? null as Record<string, unknown> | null };
  const query = vi.fn(async (sql: string, values: unknown[] = []) => {
    if (/FROM catalogs\.lane_mileage/.test(sql)) return { rows: opts.lane === false ? [] : [LANE] };
    if (/FROM catalogs\.point_mileage/.test(sql)) return { rows: [] };
    if (/INSERT INTO catalogs\.point_mileage/.test(sql)) return { rows: [] };
    if (/FROM mdata\.loads l\s+JOIN LATERAL/.test(sql)) return { rows: [{ latitude: 27.4, longitude: -99.4, city: "Laredo", state: "TX", postal_code: "78041", at: "2026-09-30T10:00:00Z" }] };
    if (/FROM mdata\.load_stops s WHERE s\.load_id/.test(sql)) return { rows: STOPS };
    if (/FROM mdata\.loads WHERE id/.test(sql)) return { rows: [{ id: LOAD, assigned_unit_id: UNIT, ...state }] };
    if (/UPDATE mdata\.loads/.test(sql)) {
      const [, , value, field, json] = values as [string, string, number, string, string];
      const col = field === "practical" ? "miles_practical" : field === "short" ? "miles_shortest" : "miles_deadhead";
      (state as Record<string, unknown>)[col] = String(value);
      state.miles_choice = { ...(state.miles_choice ?? {}), [field]: JSON.parse(json) };
      return { rows: [] };
    }
    throw new Error(`unhandled ${sql.slice(0, 80)}`);
  });
  return { query, state };
}
const route = vi.fn(async () => ({ miles: 350.4, minutes: 300 }));

describe("miles recommendations (443.55)", () => {
  it("returns Historical + Google per field with evidence; Creator values default to 'document'", async () => {
    const { milesRecommendationsForLoad } = await import("../miles-recommendations.service.js");
    const r = await milesRecommendationsForLoad(db() as never, { operatingCompanyId: CO, loadId: LOAD }, route as never);
    expect(r!.fields.practical.historical).toMatchObject({ value: 500, n_loads: 12, min: 480, max: 520, autofill_allowed: true });
    expect(r!.fields.practical.google).toMatchObject({ value: 350.4 });
    expect(r!.fields.practical.difference).toBe(-149.6);
    expect(r!.fields.empty.google).toMatchObject({ value: 350.4 });
    expect(r!.fields.practical.default_source).toBe("document");
  });

  it("never a blank: no lane -> 'no history for this lane'; no route -> 'Google had no route'", async () => {
    const { milesRecommendationsForLoad } = await import("../miles-recommendations.service.js");
    const r = await milesRecommendationsForLoad(db({ lane: false }) as never, { operatingCompanyId: CO, loadId: LOAD }, (async () => null) as never);
    expect(r!.fields.practical.historical).toBeNull();
    expect(r!.fields.practical.historical_missing_reason).toBe("no history for this lane");
    expect(r!.fields.practical.google_missing_reason).toBe("Google had no route");
  });

  it("choosing Google for Short writes the value, both recommendations, who/when, and an audit row", async () => {
    const { setMilesChoice } = await import("../miles-recommendations.service.js");
    const d = db();
    await setMilesChoice(d as never, { operatingCompanyId: CO, loadId: LOAD, field: "short", source: "google", actorUserId: ACTOR }, route as never);
    expect(d.state.miles_shortest).toBe("350.4");
    expect(d.state.miles_choice!.short).toMatchObject({ source: "google", value: 350.4, historical: 470, google: 350.4, document_value: 471, chosen_by: ACTOR });
    expect(appendCrudAudit).toHaveBeenCalledWith(expect.anything(), ACTOR, "dispatch.load.miles_choice", expect.objectContaining({ field: "short", old_value: 471, new_value: 350.4, new_source: "google" }));
  });

  it("manual needs a reason, and a value >10% from both recommendations is flagged", async () => {
    const { setMilesChoice } = await import("../miles-recommendations.service.js");
    await expect(setMilesChoice(db() as never, { operatingCompanyId: CO, loadId: LOAD, field: "practical", source: "manual", manualValue: 900, actorUserId: ACTOR }, route as never))
      .rejects.toThrow("manual_miles_requires_reason");
    const d = db();
    await setMilesChoice(d as never, { operatingCompanyId: CO, loadId: LOAD, field: "practical", source: "manual", manualValue: 900, reason: "detour", actorUserId: ACTOR }, route as never);
    expect(d.state.miles_choice!.practical).toMatchObject({ source: "manual", value: 900, reason: "detour", flag_far_from_both: true });
  });

  it("recordDocumentMilesSources records 'document' without changing any value", async () => {
    const { recordDocumentMilesSources } = await import("../miles-recommendations.service.js");
    const d = db();
    const out = await recordDocumentMilesSources(d as never, { operatingCompanyId: CO, loadId: LOAD, actorUserId: ACTOR }, route as never);
    expect(out.recorded).toEqual(["practical", "short", "empty"]);
    expect([d.state.miles_practical, d.state.miles_shortest, d.state.miles_deadhead]).toEqual(["505", "471", "38"]);
    expect(d.state.miles_choice!.practical).toMatchObject({ source: "document", value: 505 });
  });
});
