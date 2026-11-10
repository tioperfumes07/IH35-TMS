import { describe, expect, it, vi } from "vitest";
import { resolveSurvivorDriverId } from "../../../mdata/driver-merge-resolution.js";
import { HOS_DUTY_EVENTS_SHELL_REPOINT_SQL, repointHosRowsToSurvivor } from "../../../mdata/hos-shell-repoint.service.js";
import { projectHosEvent } from "../webhook-projectors/hos-projector.js";
import { resolveStopBoundary } from "../../../telematics/load-real-driven-miles.service.js";

const CO = "5c854333-6ea5-4faa-af31-67cb272fef80";
const SHELL = "e6933af3-8362-4dae-805c-31ca7b2ca091";
const SURVIVOR = "3e138476-06db-4b08-9ebe-527a5d8c591d";

describe("row 93 — HOS writers never write onto a merged shell", () => {
  it("resolveSurvivorDriverId follows merged_into_driver_id; a survivor / unknown id is unchanged", async () => {
    const q = (rows: Array<{ id: string }>) => ({ query: vi.fn(async () => ({ rows })) });
    expect(await resolveSurvivorDriverId(q([{ id: SURVIVOR }]) as never, SHELL, CO)).toBe(SURVIVOR);
    expect(await resolveSurvivorDriverId(q([{ id: SURVIVOR }]) as never, SURVIVOR, CO)).toBe(SURVIVOR);
    expect(await resolveSurvivorDriverId(q([]) as never, "unknown", CO)).toBe("unknown");
    const c = q([]);
    await resolveSurvivorDriverId(c as never, SHELL, CO);
    expect(String((c.query.mock.calls[0] as unknown[])[0])).toContain("COALESCE(d.merged_into_driver_id, d.id)");
    expect(String((c.query.mock.calls[0] as unknown[])[0])).toContain("d.operating_company_id = $2::uuid");
    expect((c.query.mock.calls[0] as unknown[])[1]).toEqual([SHELL, CO]);
  });

  it("the webhook projector writes the duty event onto the survivor when the mapping names a shell", async () => {
    const query = vi.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes("FROM mdata.drivers d") && sql.includes("COALESCE(d.merged_into_driver_id, d.id)")) {
        return { rows: [{ id: params?.[0] === SHELL ? SURVIVOR : String(params?.[0]) }] };
      }
      if (sql.includes("FROM mdata.drivers d")) return { rows: [] }; // not on the canonical map
      if (sql.includes("FROM integrations.samsara_drivers")) return { rows: [{ local_driver_id: SHELL }] }; // legacy mirror -> shell
      return { rows: [] };
    });
    const res = await projectHosEvent({ query } as never, {
      id: "e", operating_company_id: CO, event_type: "hos.updated", samsara_event_id: "s", signature_valid: true,
      payload: { data: { dutyStatus: "driving", startedAt: "2026-10-11T05:00:00.000Z", driver: { id: "57401966" } } },
      received_at: "2026-10-11T05:00:01.000Z", projection_attempts: 0,
    } as never);
    expect(res).toEqual({ success: true });
    const insert = query.mock.calls.find((c) => String(c[0]).includes("INSERT INTO hos.duty_status_events"));
    expect(insert?.[1]?.[1]).toBe(SURVIVOR);
    expect(query.mock.calls.some((c) => String(c[0]).includes("INSERT INTO hos.duty_status_events") && c[1]?.[1] === SHELL)).toBe(false);
  });

  it("the merge-time HOS repoint moves only non-duplicate events, same company, after the merge is recorded", async () => {
    expect(HOS_DUTY_EVENTS_SHELL_REPOINT_SQL).toContain("shell.merged_into_driver_id = $2::uuid");
    expect(HOS_DUTY_EVENTS_SHELL_REPOINT_SQL).toContain("e.operating_company_id = shell.operating_company_id");
    expect(HOS_DUTY_EVENTS_SHELL_REPOINT_SQL).toMatch(/NOT EXISTS[\s\S]*s\.duty_status = e\.duty_status[\s\S]*s\.started_at = e\.started_at[\s\S]*s\.source = e\.source/);
    expect(HOS_DUTY_EVENTS_SHELL_REPOINT_SQL).not.toMatch(/DELETE/i);
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("UPDATE hos.duty_status_events")) return { rows: [], rowCount: 8626 };
      if (sql.includes("UPDATE samsara.hos_snapshots")) return { rows: [], rowCount: 49486 };
      return { rows: [{ n: 408 }] };
    });
    expect(await repointHosRowsToSurvivor({ query } as never, SHELL, SURVIVOR)).toEqual({
      duty_events_moved: 8626, duty_events_duplicate_kept: 408, snapshots_moved: 49486,
    });
  });
});

describe("row 116 — real driven miles boundaries", () => {
  const A = (odometer_mi: number, read_at: string) => ({ odometer_mi, read_at, source: "odometer_readings" as const });
  const stop = (o: Record<string, unknown> = {}) => ({
    stop_id: "s1", load_id: "l1", unit_id: "u1", sequence_number: 2, latitude: 27.5, longitude: -99.5,
    arrival_at: "2026-09-28T05:00:00.000Z", departure_at: "2026-09-28T06:00:00.000Z", scheduled_arrival_at: null,
    arrival_source: "manual", departure_source: "manual", ...o,
  });
  const absent = { odo: null, at: "2026-09-28T05:40:01.000Z", src: "absent" };

  it("a fence crossing without an OBD read is measured through the anchor at the crossing's own time", () => {
    const b = resolveStopBoundary("arrival", stop(), absent, undefined, undefined, { anchor: A(571000.4, "2026-09-28T05:39:30.000Z"), reason: null });
    expect(b.anchor?.odometer_mi).toBe(571000.4);
    expect(b.at).toBe(absent.at);
    expect(b.via).toBe("geofence_time");
  });

  it("a crossing without an OBD read no longer hides a device-recorded stop time", () => {
    const b = resolveStopBoundary("arrival", stop({ arrival_source: "eld_geofence" }), absent, { anchor: A(9, "t"), reason: null }, undefined, { anchor: null, reason: "gap" });
    expect(b.anchor?.odometer_mi).toBe(9);
    expect(b.via).toBe("eld_geofence");
  });

  it("with no anchor at the crossing and nothing else, it refuses with both reasons (never a number)", () => {
    const b = resolveStopBoundary("arrival", stop(), absent, undefined, undefined, { anchor: null, reason: "the truck moved after the last odometer reading" });
    expect(b.anchor).toBeNull();
    expect(b.reason).toMatch(/absent odometer and the truck moved after the last odometer reading -- not a measurement/);
  });

  it("the deadhead start names the PREVIOUS load's stop", () => {
    const b = resolveStopBoundary("departure", stop({ sequence_number: 1 }), undefined, undefined, undefined, undefined, "previous load's stop 1 departure");
    expect(b.reason).toMatch(/^previous load's stop 1 departure: /);
  });
});

describe("row 131 — the booking's deadhead refusal is filled once the stops have points", () => {
  it("the relearn handler fills miles_deadhead only when Book Load flagged it", async () => {
    vi.resetModules();
    const fillLoadDeadhead = vi.fn(async () => ({ status: "filled", reason: null }));
    vi.doMock("../../../dispatch/load-lane-learning.service.js", () => ({
      relearnLoadStopLegs: vi.fn(async () => ({ changed: [], unresolved: [] })),
      recomputeFirstStopDeadhead: vi.fn(async () => ({ written: false, reason: "unchanged" })),
    }));
    vi.doMock("../../../telematics/stops-geocode-backfill.service.js", () => ({
      geocodeStopsWithClient: vi.fn(async () => ({ street_from_place: 0, samsara_matched: 0, zip_center_listed: [] })),
    }));
    vi.doMock("../../../dispatch/mileage/miles-recommendations.service.js", () => ({ recordDocumentMilesSources: vi.fn(), fillLoadDeadhead }));
    const { DispatchRelearnLoadMilesHandler } = await import("../../../outbox/handlers/dispatch-relearn-load-miles.handler.js");
    const ctx = { client: { query: vi.fn(async () => ({ rows: [] })) } as never, eventId: "e", instanceId: "t", log: () => {} };
    const LOAD = "426025eb-5692-4d4c-bc03-fd9ea0c262cb";
    const ACTOR = "e4117991-d2c0-406d-8cda-74e98d95bccd";
    const out = await new DispatchRelearnLoadMilesHandler().deliver({ operating_company_id: CO, load_id: LOAD, actor_user_id: ACTOR, fill_deadhead: true }, ctx);
    expect(fillLoadDeadhead).toHaveBeenCalledWith(expect.anything(), { operatingCompanyId: CO, loadId: LOAD, actorUserId: ACTOR });
    expect(out.message).toContain(":miles_deadhead:filled");
    fillLoadDeadhead.mockClear();
    await new DispatchRelearnLoadMilesHandler().deliver({ operating_company_id: CO, load_id: LOAD, actor_user_id: ACTOR }, ctx);
    expect(fillLoadDeadhead).not.toHaveBeenCalled();
  });
});
