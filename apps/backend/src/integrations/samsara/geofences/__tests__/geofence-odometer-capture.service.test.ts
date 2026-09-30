import { describe, expect, it } from "vitest";
import { captureGeofenceOdometerEvents, getGeofenceOdometerCaptureStatus } from "../geofence-odometer-capture.service.js";

describe("T-21 geofence odometer capture", () => {
  it("parses the status row into numbers, never leaving a raw pg string", async () => {
    const client = { query: async () => ({ rows: [{
      events: "690", captures: "690", real_obd: "3", interpolated: "615", absent: "72",
      newest_capture_at: "2026-09-30T16:20:15.000Z",
    }] }) };
    await expect(getGeofenceOdometerCaptureStatus(client as never, "company")).resolves.toEqual({
      events: 690, captures: 690, real_obd: 3, interpolated: 615, absent: 72,
      newest_capture_at: "2026-09-30T16:20:15.000Z",
    });
  });

  it("is idempotent per geofence event: ON CONFLICT DO NOTHING against a UNIQUE geofence_event_id", async () => {
    let insertSql = "";
    const client = { query: async (sql: string) => {
      if (sql.includes("INSERT INTO telematics.geofence_odometer_captures")) insertSql = sql;
      return { rows: [] };
    } };
    await captureGeofenceOdometerEvents(client as never, { operatingCompanyId: "c" });
    expect(insertSql).toContain("ON CONFLICT (geofence_event_id) DO NOTHING");
    expect(insertSql).toContain("NOT EXISTS");
  });

  it("never guesses a source: real_obd requires a close reading, interpolated requires two real readings, everything else is absent with no number", async () => {
    let insertSql = "";
    const client = { query: async (sql: string) => {
      if (sql.includes("INSERT INTO telematics.geofence_odometer_captures")) insertSql = sql;
      return { rows: [] };
    } };
    await captureGeofenceOdometerEvents(client as never, { operatingCompanyId: "c" });
    expect(insertSql).toContain("'real_obd'");
    expect(insertSql).toContain("'interpolated'");
    expect(insertSql).toContain("'absent'");
    // absent is the ELSE branch -- no interpolation math runs when it fires
    expect(insertSql).toMatch(/ELSE\s+NULL\s+END AS odometer_mi/);
    expect(insertSql).toMatch(/ELSE 'absent'\s+END AS odometer_source/);
  });

  it("captures the location_kind so Love's/DOT/customer-site/yard crossings are distinguishable", async () => {
    let insertSql = "";
    const client = { query: async (sql: string) => {
      if (sql.includes("INSERT INTO telematics.geofence_odometer_captures")) insertSql = sql;
      return { rows: [] };
    } };
    await captureGeofenceOdometerEvents(client as never, { operatingCompanyId: "c" });
    expect(insertSql).toContain("gf.location_kind");
    expect(insertSql).toContain("JOIN geo.geofences gf ON gf.id = ge.geofence_id");
  });
});
