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
    if (/FROM identity\.users/.test(sql)) return { rows: [{ id: ACTOR, name: "Jorge Munoz" }] };
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

  it("shows who chose by name and never offers a 0 empty-miles average", async () => {
    const { milesRecommendationsForLoad } = await import("../miles-recommendations.service.js");
    const d = db({ choice: { practical: { source: "document", value: 505, chosen_by: ACTOR, chosen_at: "2026-10-11T00:00:00Z" } } });
    const r = await milesRecommendationsForLoad(d as never, { operatingCompanyId: CO, loadId: LOAD }, route as never);
    expect(r!.fields.practical.current?.chosen_by).toBe("Jorge Munoz");
    LANE.empty_miles = "0";
    const z = await milesRecommendationsForLoad(db() as never, { operatingCompanyId: CO, loadId: LOAD }, route as never);
    LANE.empty_miles = "40.0";
    expect(z!.fields.empty.historical).toBeNull();
    expect(z!.fields.empty.historical_missing_reason).toBe("no empty-miles history for this lane");
  });
});

// LEAD 443.240 (owner 10-22: "read the company and driver settlements. you did not seed correctly") — MILES PRECEDENCE: the signed
// settlement document first; a document value is LOCKED against lane history / Google / manual. Fails on the old engine (no
// documentValue, and Google overwrote a document value — 13684's 466.7 empty miles became Google's 1,817.3).
describe("443.240 — the signed settlement document wins", () => {
  it("source 'document' with the settlement's value writes it and records it as the document value", async () => {
    const { setMilesChoice } = await import("../miles-recommendations.service.js");
    const d = db();
    await setMilesChoice(d as never, { operatingCompanyId: CO, loadId: LOAD, field: "empty", source: "document", documentValue: 466.7, reason: "Driver Settlement 5849", actorUserId: ACTOR }, route as never);
    expect(d.state.miles_deadhead).toBe("466.7");
    expect(d.state.miles_choice!.empty).toMatchObject({ source: "document", value: 466.7, document_value: 466.7, reason: "Driver Settlement 5849" });
  });

  it("a document value is locked: Google / lane history / manual are refused", async () => {
    const { setMilesChoice } = await import("../miles-recommendations.service.js");
    const d = db({ choice: { short: { source: "document", value: 1510.4, document_value: 1510.4 } } });
    await expect(setMilesChoice(d as never, { operatingCompanyId: CO, loadId: LOAD, field: "short", source: "google", actorUserId: ACTOR }, route as never)).rejects.toThrow("document_miles_locked_short");
    await expect(setMilesChoice(d as never, { operatingCompanyId: CO, loadId: LOAD, field: "short", source: "historical", actorUserId: ACTOR }, route as never)).rejects.toThrow("document_miles_locked_short");
    await expect(setMilesChoice(d as never, { operatingCompanyId: CO, loadId: LOAD, field: "short", source: "manual", manualValue: 1600, reason: "x", actorUserId: ACTOR }, route as never)).rejects.toThrow("document_miles_locked_short");
  });

  it("a documentValue only travels with source 'document'", async () => {
    const { setMilesChoice } = await import("../miles-recommendations.service.js");
    await expect(setMilesChoice(db() as never, { operatingCompanyId: CO, loadId: LOAD, field: "short", source: "google", documentValue: 100, actorUserId: ACTOR }, route as never)).rejects.toThrow("document_value_requires_source_document");
  });
});
