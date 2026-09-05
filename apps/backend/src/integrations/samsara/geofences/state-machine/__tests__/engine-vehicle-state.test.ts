import { describe, expect, it } from "vitest";
import { geofenceVehicleStateTableExists, hasSustainedDepartureSpeed, transitionState } from "../engine.js";

type Row = Record<string, unknown>;
type MockClient = { query: (sql: string, values?: unknown[]) => Promise<{ rows: Row[] }> };

function mockClient(handler: (sql: string, values?: unknown[]) => Row[]): MockClient {
  return { query: async (sql, values) => ({ rows: handler(sql, values) }) };
}

describe("GAP-39 DEFECT A — per-vehicle state, refuse-not-crash when the table is missing", () => {
  it("geofenceVehicleStateTableExists reads to_regclass honestly", async () => {
    const existsClient = mockClient(() => [{ exists: true }]);
    expect(await geofenceVehicleStateTableExists(existsClient)).toBe(true);

    const missingClient = mockClient(() => [{ exists: false }]);
    expect(await geofenceVehicleStateTableExists(missingClient)).toBe(false);
  });

  it("transitionState refuses cleanly (skipped, not thrown) when geo.geofence_vehicle_state does not exist", async () => {
    const client = mockClient((sql) => {
      if (sql.includes("to_regclass")) return [{ exists: false }];
      throw new Error(`unexpected query while table is missing: ${sql}`);
    });
    const result = await transitionState(client, {
      operatingCompanyId: "11111111-1111-1111-1111-111111111111",
      geofenceId: "22222222-2222-2222-2222-222222222222",
      vehicleId: "33333333-3333-3333-3333-333333333333",
      gpsPosition: { lat: 27.5, lng: -99.5 },
      geofenceCenter: { lat: 27.5, lng: -99.5 },
    });
    expect(result).toEqual({ skipped: true, reason: "geofence_vehicle_state_table_missing" });
  });

  it("does not write to the legacy shared geo.geofences column even when the new table is missing (the flap must stop, not fall back)", async () => {
    const queries: string[] = [];
    const client = mockClient((sql) => {
      queries.push(sql);
      if (sql.includes("to_regclass")) return [{ exists: false }];
      return [];
    });
    await transitionState(client, {
      operatingCompanyId: "11111111-1111-1111-1111-111111111111",
      geofenceId: "22222222-2222-2222-2222-222222222222",
      vehicleId: "33333333-3333-3333-3333-333333333333",
      gpsPosition: { lat: 0, lng: 0 },
      geofenceCenter: { lat: 0, lng: 0 },
    });
    expect(queries.some((q) => q.includes("UPDATE geo.geofences"))).toBe(false);
  });
});

describe("GAP-39 — departure speed must be genuinely sustained, not a single fast ping", () => {
  it("returns false with zero samples in the window", async () => {
    const client = mockClient(() => [{ min_speed: null, sample_count: "0", earliest_captured_at: null }]);
    expect(await hasSustainedDepartureSpeed(client, "c1", "u1", 3, 15)).toBe(false);
  });

  it("returns false when the earliest sample is too fresh to prove 3 sustained minutes", async () => {
    const client = mockClient(() => [
      { min_speed: 20, sample_count: "1", earliest_captured_at: new Date(Date.now() - 10_000).toISOString() },
    ]);
    expect(await hasSustainedDepartureSpeed(client, "c1", "u1", 3, 15)).toBe(false);
  });

  it("returns false when the minimum speed across the window dips below the threshold", async () => {
    const client = mockClient(() => [
      { min_speed: 4, sample_count: "6", earliest_captured_at: new Date(Date.now() - 3 * 60_000).toISOString() },
    ]);
    expect(await hasSustainedDepartureSpeed(client, "c1", "u1", 3, 15)).toBe(false);
  });

  it("returns true when every sample across a full window is at or above the threshold", async () => {
    const client = mockClient(() => [
      { min_speed: 22, sample_count: "6", earliest_captured_at: new Date(Date.now() - 3 * 60_000).toISOString() },
    ]);
    expect(await hasSustainedDepartureSpeed(client, "c1", "u1", 3, 15)).toBe(true);
  });
});

describe("GAP-39 — manual override forces the exact requested state, validated but not recomputed", () => {
  it("forceToState bypasses distance/speed computation entirely", async () => {
    const client = mockClient((sql) => {
      if (sql.includes("to_regclass")) return [{ exists: true }];
      if (sql.startsWith("INSERT INTO geo.geofence_vehicle_state")) return [];
      if (sql.startsWith("SELECT current_state")) return [{ current_state: "idle" }];
      if (sql.startsWith("INSERT INTO geo.geofence_state_transitions")) return [{ id: "tx-1" }];
      if (sql.startsWith("UPDATE geo.geofence_vehicle_state")) return [];
      return [];
    });
    // A huge distance would normally propose "idle" stays "idle" (no change) — forceToState
    // overrides that entirely, and the transition is still validated (idle -> approaching is legal).
    const result = await transitionState(client, {
      operatingCompanyId: "11111111-1111-1111-1111-111111111111",
      geofenceId: "22222222-2222-2222-2222-222222222222",
      vehicleId: "33333333-3333-3333-3333-333333333333",
      gpsPosition: { lat: 0, lng: 0 },
      geofenceCenter: { lat: 89, lng: 179 },
      forceToState: "approaching",
    });
    expect(result).toMatchObject({ changed: true, from_state: "idle", to_state: "approaching" });
  });
});
