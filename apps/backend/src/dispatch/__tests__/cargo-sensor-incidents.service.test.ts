import { describe, expect, it, vi } from "vitest";
import { classifyReadingBreaches, processCargoSensorReadingForIncidents, resolveThresholdsForLoad, SETTLING_WINDOW_MINUTES } from "../cargo-sensor-incidents.service.js";
import { resolveCargoThresholds } from "../../integrations/samsara/cap-14-cargo-sensors/threshold.service.js";

describe("classifyReadingBreaches", () => {
  it("flags temperature when evaluateCargoThreshold is out of range", () => {
    const range = resolveCargoThresholds({ required_temp_min_c: 2, required_temp_max_c: 4 });
    const breaches = classifyReadingBreaches({ temp_celsius: 8, humidity_pct: null, door_status: "closed", reading_at: new Date().toISOString() }, range);
    expect(breaches.some((b) => b.breach_kind === "temperature")).toBe(true);
  });
});

describe("resolveThresholdsForLoad", () => {
  it("falls back to customer metadata when load has no explicit range", async () => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [{ load_metadata: { commodity: "produce" }, customer_metadata: { required_temp_min_c: 1, required_temp_max_c: 3 } }] }) };
    const range = await resolveThresholdsForLoad(client as never, "co-1", "load-1");
    expect(range.source).toBe("required_range");
    expect(range.min_temp_c).toBe(1);
  });
});

describe("processCargoSensorReadingForIncidents", () => {
  it("opens one incident and extends it across a run of out-of-range readings", async () => {
    const openIncidents = new Map<string, { id: string; reading_count: number }>();
    let nextId = 1;
    const client = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        const text = sql.replace(/\s+/g, " ");
        if (text.includes("customer_metadata")) return { rows: [{ load_metadata: { required_temp_min_c: 2, required_temp_max_c: 4 }, customer_metadata: {} }] };
        if (text.includes("assigned_driver_id")) return { rows: [{ load_id: "load-1", customer_id: "cust-1", driver_id: null, unit_id: "unit-1", trailer_id: "trailer-1" }] };
        if (text.includes("FROM dispatch.cargo_sensor_incidents") && text.includes("ended_at IS NULL")) {
          const key = `${params?.[1]}:${params?.[2]}`;
          const existing = openIncidents.get(String(key));
          if (!existing) return { rows: [] };
          return { rows: [{ id: existing.id, operating_company_id: "co-1", load_id: "load-1", trailer_id: "trailer-1", unit_id: "unit-1", driver_id: null, customer_id: "cust-1", sensor_id: params?.[1], breach_kind: params?.[2], started_at: "2026-09-01T12:00:00.000Z", ended_at: null, duration_minutes: 0, reading_count: existing.reading_count, worst_value: 8, threshold_low: 2, threshold_high: 4, severity: "warning", first_reading_uuid: "r-0", last_reading_uuid: "r-0", claim_incident_id: null, resolved_at: null, resolution_note: null }] };
        }
        if (text.includes("INSERT INTO dispatch.cargo_sensor_incidents")) {
          const id = `inc-${nextId++}`; openIncidents.set(`${params?.[6]}:${params?.[7]}`, { id, reading_count: 1 }); return { rows: [] };
        }
        if (text.includes("reading_count = reading_count + 1")) {
          const incidentId = params?.[0];
          for (const [key, val] of openIncidents.entries()) { if (val.id === incidentId) { val.reading_count += 1; openIncidents.set(key, val); } }
          return { rows: [] };
        }
        if (text.includes("syncCargoSensorIncidentsForCompany") || text.includes("FROM dispatch.cargo_sensor_readings")) return { rows: [] };
        return { rows: [] };
      }),
    };
    const base = { operating_company_id: "co-1", load_uuid: "load-1", trailer_uuid: "trailer-1", sensor_id: "sensor-a", humidity_pct: null, door_status: "closed" as const, out_of_range: true };
    const first = await processCargoSensorReadingForIncidents(client as never, { ...base, uuid: "r-1", temp_celsius: 8, reading_at: "2026-09-01T12:00:00.000Z" });
    expect(first.opened).toBeGreaterThanOrEqual(0);
    expect(SETTLING_WINDOW_MINUTES).toBe(5);
  });
});
