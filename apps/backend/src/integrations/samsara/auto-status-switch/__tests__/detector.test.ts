/**
 * GAP-56 / CAP-4 — Auto status switch detector tests.
 */
import { describe, expect, it } from "vitest";
import {
  DELIVERY_DWELL_MIN,
  MOVEMENT_MILES,
  MOVEMENT_WINDOW_MIN,
  STATIONARY_WINDOW_MIN,
  detectStatusDriftFromContext,
  evaluateCaseA,
  evaluateCaseB,
  evaluateCaseC,
  evaluateCaseD,
  haversineMiles,
  processDriftForLoad,
  type LoadGpsContext,
} from "../detector.service.js";

function baseContext(overrides: Partial<LoadGpsContext> = {}): LoadGpsContext {
  return {
    load_uuid: "load-1",
    operating_company_id: "co-1",
    unit_uuid: "unit-1",
    driver_uuid: "drv-1",
    current_status: "at_pickup",
    lat: 29.5,
    lng: -98.5,
    speed_mph: 55,
    recorded_at: new Date().toISOString(),
    pickup_lat: 29.4,
    pickup_lng: -98.5,
    delivery_lat: 30.0,
    delivery_lng: -97.5,
    position_30min_ago_lat: 29.4,
    position_30min_ago_lng: -98.5,
    position_30min_ago_at: new Date(Date.now() - MOVEMENT_WINDOW_MIN * 60000).toISOString(),
    delivery_geofence_entered_at: null,
    ...overrides,
  };
}

describe("haversineMiles", () => {
  it("returns ~0 for identical coordinates", () => {
    expect(haversineMiles(29.4, -98.5, 29.4, -98.5)).toBeLessThan(0.01);
  });

  it("detects distances over 5 miles", () => {
    const miles = haversineMiles(29.4, -98.5, 29.5, -98.5);
    expect(miles).toBeGreaterThan(5);
  });
});

describe("Case A — departed pickup while status at_pickup", () => {
  it("proposes in_transit when GPS moved more than 5mi in 30min", () => {
    const drift = evaluateCaseA(baseContext());
    expect(drift?.case_id).toBe("A");
    expect(drift?.action).toBe("auto_apply");
    expect(drift?.proposed_status).toBe("in_transit");
    expect(drift?.reason).toContain(String(MOVEMENT_WINDOW_MIN));
  });

  it("does not fire when movement is under threshold", () => {
    expect(evaluateCaseA(baseContext({ lat: 29.401, lng: -98.5 }))).toBeNull();
  });

  it("does not fire when status is not at_pickup", () => {
    expect(evaluateCaseA(baseContext({ current_status: "in_transit" }))).toBeNull();
  });
});

describe("Case B — stationary at pickup while status in_transit", () => {
  it("flags dispatcher review without auto-revert", () => {
    const drift = evaluateCaseB(
      baseContext({
        current_status: "in_transit",
        lat: 29.4,
        lng: -98.5,
        position_30min_ago_lat: 29.4,
        position_30min_ago_lng: -98.5001,
      })
    );
    expect(drift?.case_id).toBe("B");
    expect(drift?.action).toBe("flag_intransit_issue");
    expect(drift?.proposed_status).toBeNull();
    expect(drift?.reason).toContain(String(STATIONARY_WINDOW_MIN));
  });

  it("does not fire when truck is away from pickup geofence", () => {
    expect(
      evaluateCaseB(
        baseContext({
          current_status: "in_transit",
          lat: 30.0,
          lng: -97.5,
        })
      )
    ).toBeNull();
  });
});

describe("Case C — at delivery geofence while status in_transit", () => {
  it("proposes at_delivery after dwell threshold", () => {
    const enteredAt = new Date(Date.now() - (DELIVERY_DWELL_MIN + 2) * 60000).toISOString();
    const drift = evaluateCaseC(
      baseContext({
        current_status: "in_transit",
        lat: 30.0,
        lng: -97.5,
        delivery_geofence_entered_at: enteredAt,
      })
    );
    expect(drift?.case_id).toBe("C");
    expect(drift?.action).toBe("auto_apply");
    expect(drift?.proposed_status).toBe("at_delivery");
  });

  it("does not fire before dwell threshold", () => {
    const enteredAt = new Date(Date.now() - 2 * 60000).toISOString();
    expect(
      evaluateCaseC(
        baseContext({
          current_status: "in_transit",
          lat: 30.0,
          lng: -97.5,
          delivery_geofence_entered_at: enteredAt,
        })
      )
    ).toBeNull();
  });
});

describe("detectStatusDriftFromContext priority", () => {
  it("prefers Case A over B/C when multiple match inputs", () => {
    const enteredAt = new Date(Date.now() - (DELIVERY_DWELL_MIN + 2) * 60000).toISOString();
    const drift = detectStatusDriftFromContext(
      baseContext({
        current_status: "at_pickup",
        delivery_geofence_entered_at: enteredAt,
      })
    );
    expect(drift?.case_id).toBe("A");
  });
});

describe("audit tagging contract", () => {
  it("includes auto_switched=true only on auto-apply actions", () => {
    const autoApply = evaluateCaseA(baseContext());
    const flagOnly = evaluateCaseB(
      baseContext({
        current_status: "in_transit",
        lat: 29.4,
        lng: -98.5,
        position_30min_ago_lat: 29.4,
        position_30min_ago_lng: -98.5,
      })
    );
    expect(autoApply?.action).toBe("auto_apply");
    expect(flagOnly?.action).toBe("flag_intransit_issue");
  });
});

describe("idempotency expectations", () => {
  it("uses movement threshold constants for Case A re-check window", () => {
    expect(MOVEMENT_MILES).toBe(5);
    expect(MOVEMENT_WINDOW_MIN).toBe(30);
  });
});

// 11-16 — USMCA loads go dispatched → delivered; with no case for "dispatched" E-29 never had a load to read.
describe("E-29 Case D — dispatched load whose truck is parked at the pickup", () => {
  const parkedAtPickup = { current_status: "dispatched", lat: 29.4, lng: -98.5, position_30min_ago_lat: 29.4, position_30min_ago_lng: -98.5 };
  it("proposes at_pickup when the truck sits inside the pickup fence", () => {
    const d = evaluateCaseD(baseContext(parkedAtPickup));
    expect(d).toMatchObject({ case_id: "D", action: "auto_apply", proposed_status: "at_pickup" });
    expect(detectStatusDriftFromContext(baseContext(parkedAtPickup))?.case_id).toBe("D");
  });
  it("does nothing while the truck is still driving through the fence", () => {
    expect(evaluateCaseD(baseContext({ ...parkedAtPickup, position_30min_ago_lat: 29.2 }))).toBeNull();
  });
  it("does nothing away from the pickup, or for any status other than dispatched", () => {
    expect(evaluateCaseD(baseContext({ ...parkedAtPickup, lat: 29.9, position_30min_ago_lat: 29.9 }))).toBeNull();
    expect(evaluateCaseD(baseContext({ ...parkedAtPickup, current_status: "in_transit" }))).toBeNull();
  });
});

describe("E-29 with AUTO_STATUS_SWITCH_APPLY off — the detection is recorded, the load is not touched", () => {
  function fakeDb(opts: { proposedBefore: boolean }) {
    const writes: string[] = [];
    const client = {
      async query(sql: string) {
        if (/UPDATE mdata\.loads/.test(sql)) writes.push("loads");
        if (/INSERT INTO integrations\.auto_status_switch_events/.test(sql)) { writes.push("event"); return { rows: [{ uuid: "e1" }] }; }
        if (/AND auto_switched = false/.test(sql)) return { rows: opts.proposedBefore ? [{ "?column?": 1 }] : [] };
        if (/FROM integrations\.auto_status_position_snapshots/.test(sql)) return { rows: [{ lat: "29.4", lng: "-98.5", recorded_at: new Date(Date.now() - 31 * 60000).toISOString() }] };
        if (/FROM mdata\.loads l/.test(sql)) return { rows: [{ load_uuid: "load-1", operating_company_id: "co-1", unit_uuid: "unit-1", driver_uuid: "drv-1", current_status: "dispatched", lat: "29.4", lng: "-98.5", speed_mph: "0", recorded_at: new Date().toISOString(), pickup_lat: "29.4", pickup_lng: "-98.5", delivery_lat: "30.0", delivery_lng: "-97.5" }] };
        return { rows: [] };
      },
    };
    return { client, writes };
  }
  it("writes one proposal row (auto_switched=false) and never the load", async () => {
    delete process.env.AUTO_STATUS_SWITCH_APPLY;
    const db = fakeDb({ proposedBefore: false });
    const r = await processDriftForLoad(db.client as never, "co-1", "load-1");
    expect(r.drift?.case_id).toBe("D");
    expect(r.result).toMatchObject({ applied: false, proposal_recorded: true });
    expect(db.writes).toEqual(["event"]);
  });
  it("a truck parked for hours is one proposal, not one per tick", async () => {
    delete process.env.AUTO_STATUS_SWITCH_APPLY;
    const db = fakeDb({ proposedBefore: true });
    const r = await processDriftForLoad(db.client as never, "co-1", "load-1");
    expect(r.result).toMatchObject({ proposal_recorded: false });
    expect(db.writes).toEqual([]);
  });
});
