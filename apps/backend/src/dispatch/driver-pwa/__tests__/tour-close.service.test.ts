import { describe, expect, it, vi } from "vitest";

vi.mock("../../../audit/crud-audit.js", () => ({
  appendCrudAudit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../driver-finance/settlements-load-bookended.service.js", () => ({
  getActiveSettlementForDriver: vi.fn(),
  stampTripClosedForBookendedSettlement: vi.fn(),
}));

// 25-TASK #4: closeTourForDriver now also closes the company settlement alongside the driver
// settlement. Mocked at the module boundary (same pattern as settlements-load-bookended above) —
// its own real SQL is proven separately in company-settlement-close.service.test.ts.
vi.mock("../../../accounting/company-settlement-close.service.js", () => ({
  closeCompanySettlementAlongsideDriverSettlement: vi.fn(),
}));

import { closeTourForDriver, resolveTourCloseEligibility, TourCloseError } from "../tour-close.service.js";
import {
  getActiveSettlementForDriver,
  stampTripClosedForBookendedSettlement,
} from "../../../driver-finance/settlements-load-bookended.service.js";
import { closeCompanySettlementAlongsideDriverSettlement } from "../../../accounting/company-settlement-close.service.js";

const OPCO = "5c854333-6ea5-4faa-af31-67cb272fef80";
const DRIVER_ID = "22222222-2222-2222-2222-222222222222";
const UNIT_ID = "33333333-3333-3333-3333-333333333333";
const GEOFENCE_ID = "44444444-4444-4444-4444-444444444444";

// Square around lat=27.6514879 lng=-99.6309410, matches the migration's seeded vertices.
const YARD_VERTICES = [
  { lat: 27.65217241, lng: -99.63171377 },
  { lat: 27.65217241, lng: -99.63016823 },
  { lat: 27.65080339, lng: -99.63016823 },
  { lat: 27.65080339, lng: -99.63171377 },
];
const INSIDE_LAT = 27.6514879;
const INSIDE_LNG = -99.630941;
// Far outside — a different Laredo-area point, several miles away.
const OUTSIDE_LAT = 27.55;
const OUTSIDE_LNG = -99.5;

type Overrides = {
  activeLoadNumbers?: string[];
  liveUnit?: { unit_id: string; unit_number: string | null } | null;
  fallbackUnit?: { assigned_unit_id: string | null; unit_number: string | null } | null;
  yard?: { id: string; vertices_json: unknown } | null;
  position?: { lat: number; lng: number; captured_at: string } | null;
};

function makeClient(overrides: Overrides = {}) {
  const client = {
    query: vi.fn(async (sql: string) => {
      if (/FROM mdata\.loads[\s\S]*status::text = ANY/.test(sql)) {
        return { rows: (overrides.activeLoadNumbers ?? []).map((n) => ({ load_number: n })) };
      }
      if (/FROM telematics\.vehicle_driver_assignments/.test(sql)) {
        return { rows: overrides.liveUnit ? [overrides.liveUnit] : [] };
      }
      if (/assigned_unit_id IS NOT NULL/.test(sql)) {
        return { rows: overrides.fallbackUnit ? [overrides.fallbackUnit] : [] };
      }
      if (/FROM geo\.geofences/.test(sql)) {
        return { rows: overrides.yard ? [overrides.yard] : [] };
      }
      if (/FROM telematics\.vehicle_latest_position/.test(sql)) {
        return { rows: overrides.position ? [overrides.position] : [] };
      }
      return { rows: [] };
    }),
  };
  return client;
}

describe("tour close + geofence — MILES SPEC item 4 (owner 2026-09-02)", () => {
  it("blocks close when the driver has an active load — never checks position at all when already blocked", async () => {
    const client = makeClient({ activeLoadNumbers: ["L-20260902-0001"] });
    const result = await resolveTourCloseEligibility(client as never, { operatingCompanyId: OPCO, driverId: DRIVER_ID });
    expect(result.can_close).toBe(false);
    expect(result.has_active_load).toBe(true);
    expect(result.active_load_numbers).toEqual(["L-20260902-0001"]);
    expect(result.should_prompt_deadhead_to_yard).toBe(false);
  });

  it("no active load, no unit resolvable — refuses, never guesses a position", async () => {
    const client = makeClient({ activeLoadNumbers: [] });
    const result = await resolveTourCloseEligibility(client as never, { operatingCompanyId: OPCO, driverId: DRIVER_ID });
    expect(result.can_close).toBe(false);
    expect(result.unit_id).toBeNull();
    expect(result.should_prompt_deadhead_to_yard).toBe(true);
  });

  it("no active load, unit resolved via live Samsara pairing, no yard geofence configured — refuses", async () => {
    const client = makeClient({
      activeLoadNumbers: [],
      liveUnit: { unit_id: UNIT_ID, unit_number: "T169" },
      yard: null,
    });
    const result = await resolveTourCloseEligibility(client as never, { operatingCompanyId: OPCO, driverId: DRIVER_ID });
    expect(result.can_close).toBe(false);
    expect(result.unit_id).toBe(UNIT_ID);
    expect(result.reason).toMatch(/no active yard geofence/);
  });

  it("no active load, unit resolved, yard exists, position stale/missing — refuses and never guesses at_yard", async () => {
    const client = makeClient({
      activeLoadNumbers: [],
      liveUnit: { unit_id: UNIT_ID, unit_number: "T169" },
      yard: { id: GEOFENCE_ID, vertices_json: YARD_VERTICES },
      position: null,
    });
    const result = await resolveTourCloseEligibility(client as never, { operatingCompanyId: OPCO, driverId: DRIVER_ID });
    expect(result.can_close).toBe(false);
    expect(result.at_yard).toBe(false);
    expect(result.position_stale_or_missing).toBe(true);
    expect(result.should_prompt_deadhead_to_yard).toBe(true);
  });

  it("no active load, fresh position OUTSIDE the yard geofence — refuses, prompts deadhead to yard", async () => {
    const client = makeClient({
      activeLoadNumbers: [],
      liveUnit: { unit_id: UNIT_ID, unit_number: "T169" },
      yard: { id: GEOFENCE_ID, vertices_json: YARD_VERTICES },
      position: { lat: OUTSIDE_LAT, lng: OUTSIDE_LNG, captured_at: new Date().toISOString() },
    });
    const result = await resolveTourCloseEligibility(client as never, { operatingCompanyId: OPCO, driverId: DRIVER_ID });
    expect(result.can_close).toBe(false);
    expect(result.at_yard).toBe(false);
    expect(result.position_stale_or_missing).toBe(false);
    expect(result.should_prompt_deadhead_to_yard).toBe(true);
  });

  it("no active load, fresh position INSIDE the yard geofence — eligible to close", async () => {
    const client = makeClient({
      activeLoadNumbers: [],
      liveUnit: { unit_id: UNIT_ID, unit_number: "T169" },
      yard: { id: GEOFENCE_ID, vertices_json: YARD_VERTICES },
      position: { lat: INSIDE_LAT, lng: INSIDE_LNG, captured_at: new Date().toISOString() },
    });
    const result = await resolveTourCloseEligibility(client as never, { operatingCompanyId: OPCO, driverId: DRIVER_ID });
    expect(result.can_close).toBe(true);
    expect(result.at_yard).toBe(true);
    expect(result.should_prompt_deadhead_to_yard).toBe(false);
  });

  it("falls back to the driver's most recent load's assigned_unit_id when no live Samsara pairing exists", async () => {
    const client = makeClient({
      activeLoadNumbers: [],
      liveUnit: null,
      fallbackUnit: { assigned_unit_id: UNIT_ID, unit_number: "T169" },
      yard: { id: GEOFENCE_ID, vertices_json: YARD_VERTICES },
      position: { lat: INSIDE_LAT, lng: INSIDE_LNG, captured_at: new Date().toISOString() },
    });
    const result = await resolveTourCloseEligibility(client as never, { operatingCompanyId: OPCO, driverId: DRIVER_ID });
    expect(result.unit_id).toBe(UNIT_ID);
    expect(result.can_close).toBe(true);
  });
});

describe("closeTourForDriver — re-validates server-side, never trusts a client-supplied eligibility flag", () => {
  it("refuses (TourCloseError) when not eligible, and never calls getActiveSettlementForDriver", async () => {
    const client = makeClient({ activeLoadNumbers: ["L-20260902-0002"] });
    await expect(
      closeTourForDriver(client as never, { operatingCompanyId: OPCO, driverId: DRIVER_ID, actorUserId: "u1" })
    ).rejects.toThrow(TourCloseError);
    expect(getActiveSettlementForDriver).not.toHaveBeenCalled();
  });

  it("eligible, no open settlement — reports closed:false, not an error", async () => {
    vi.mocked(getActiveSettlementForDriver).mockResolvedValueOnce(null);
    const client = makeClient({
      activeLoadNumbers: [],
      liveUnit: { unit_id: UNIT_ID, unit_number: "T169" },
      yard: { id: GEOFENCE_ID, vertices_json: YARD_VERTICES },
      position: { lat: INSIDE_LAT, lng: INSIDE_LNG, captured_at: new Date().toISOString() },
    });
    const result = await closeTourForDriver(client as never, { operatingCompanyId: OPCO, driverId: DRIVER_ID, actorUserId: "u1" });
    expect(result.closed).toBe(false);
    expect(result.settlement_id).toBeNull();
    expect(result.company_settlement_id).toBeNull();
    // 25-TASK #4: nothing to close alongside — the company settlement close must never fire.
    expect(closeCompanySettlementAlongsideDriverSettlement).not.toHaveBeenCalled();
  });

  it("eligible, open settlement exists — stamps trip closed, closes the company settlement alongside it, reports closed:true", async () => {
    vi.mocked(getActiveSettlementForDriver).mockResolvedValueOnce({ settlementId: "s1", settlementNumber: "S-13500" });
    vi.mocked(stampTripClosedForBookendedSettlement).mockResolvedValueOnce({
      stamped: true,
      trip_closed_at: "2026-09-02T22:00:00.000Z",
      anchor_load_id: "load-1",
    });
    vi.mocked(closeCompanySettlementAlongsideDriverSettlement).mockResolvedValueOnce({
      company_settlement_id: "cs1",
      display_id: "CS-2026-0001",
      status: "closed",
      already_closed: false,
    });
    const client = makeClient({
      activeLoadNumbers: [],
      liveUnit: { unit_id: UNIT_ID, unit_number: "T169" },
      yard: { id: GEOFENCE_ID, vertices_json: YARD_VERTICES },
      position: { lat: INSIDE_LAT, lng: INSIDE_LNG, captured_at: new Date().toISOString() },
    });
    const result = await closeTourForDriver(client as never, { operatingCompanyId: OPCO, driverId: DRIVER_ID, actorUserId: "u1" });
    expect(result.closed).toBe(true);
    expect(result.settlement_id).toBe("s1");
    expect(result.settlement_number).toBe("S-13500");
    expect(result.company_settlement_id).toBe("cs1");
    expect(result.company_settlement_number).toBe("CS-2026-0001");
    expect(stampTripClosedForBookendedSettlement).toHaveBeenCalledWith(
      client,
      expect.objectContaining({ settlementId: "s1", operatingCompanyId: OPCO, actorUserId: "u1" })
    );
    // 25-TASK #4: "one close, two settlements" — same client (same transaction), the driver
    // settlement id passed straight through as driverSettlementId.
    expect(closeCompanySettlementAlongsideDriverSettlement).toHaveBeenCalledWith(
      client,
      expect.objectContaining({ operatingCompanyId: OPCO, driverSettlementId: "s1", actorUserId: "u1" })
    );
  });
});
