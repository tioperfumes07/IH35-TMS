import { describe, expect, it } from "vitest";
import { absentOdometerReason, loadPmOdometers } from "../pm-current-odometer.js";
import { computePmDueEngineForCompany } from "../pm-due-engine.service.js";

const OPCO = "00000000-0000-4000-8000-0000000000aa";
const UNIT = "00000000-0000-4000-8000-000000000001";

function client(opts: { live: boolean; stop: number | null; snap: number | null; schedules?: unknown[] }) {
  return {
    query: async <T>(sql: string): Promise<{ rows: T[] }> => {
      const rows = (x: unknown[]) => ({ rows: x as T[] });
      if (sql.includes("to_regclass('telematics.unit_stop_events')")) return rows([{ ok: opts.live }]);
      if (sql.includes("FROM telematics.unit_stop_events")) return rows(opts.stop == null ? [] : [{ unit_id: UNIT, odometer_mi: opts.stop, read_at: "2026-10-01 01:00:00+00" }]);
      if (sql.includes("FROM telematics.odometer_readings") && sql.includes("DISTINCT ON")) return rows(opts.snap == null ? [] : [{ unit_id: UNIT, odometer_miles: opts.snap, read_at: "2026-09-30 19:45:00+00" }]);
      if (sql.includes("FROM maintenance.pm_schedules")) return rows(opts.schedules ?? []);
      if (sql.includes("confidence = 'suggested'")) return rows([{ n: "0" }]);
      if (sql.includes("ORDER BY read_at ASC")) return rows([{ odometer_miles: "400000", read_at: "2026-07-01" }, { odometer_miles: "430000", read_at: "2026-09-29" }]);
      return rows([]);
    },
  };
}

describe("loadPmOdometers -- unit_stop_events -> odometer_readings -> ABSENT", () => {
  it("stop events win when live", async () => {
    const { byUnit } = await loadPmOdometers(client({ live: true, stop: 455487.2, snap: 455164 }), OPCO, [UNIT]);
    expect(byUnit.get(UNIT)).toMatchObject({ odometer: 455487.2, source: "unit_stop_events" });
  });
  it("E-03 pending: the table is never queried and the snapshot answers", async () => {
    const { byUnit, stopEventsLive } = await loadPmOdometers(client({ live: false, stop: 999999, snap: 455164 }), OPCO, [UNIT]);
    expect(stopEventsLive).toBe(false);
    expect(byUnit.get(UNIT)).toMatchObject({ odometer: 455164, source: "odometer_readings" });
  });
  it("nothing anywhere is ABSENT -- no entry, never 0", async () => {
    const { byUnit } = await loadPmOdometers(client({ live: true, stop: null, snap: null }), OPCO, [UNIT]);
    expect(byUnit.has(UNIT)).toBe(false);
    expect(absentOdometerReason(false)).toMatch(/E-03 pending/);
  });
});

describe("E-15 PM due engine on the same source", () => {
  const sched = (over: Record<string, unknown>) => ({ id: "s1", unit_id: UNIT, unit_number: "T174", label: "PM-A", interval_kind: "miles", interval_value: 25000, last_service_odometer: null, next_due_odometer: null, ...over });

  it("NULL baseline stays absent with the reason, odometer still shown with its source", async () => {
    const [row] = await computePmDueEngineForCompany(client({ live: false, stop: null, snap: 455164, schedules: [sched({})] }), OPCO);
    expect(row).toMatchObject({ current_odometer: 455164, current_odometer_source: "odometer_readings", projected_due_date: null });
    expect(row.reason).toMatch(/no baseline/);
  });
  it("a days interval is listed with its reason, never dropped", async () => {
    const [row] = await computePmDueEngineForCompany(client({ live: false, stop: null, snap: 455164, schedules: [sched({ label: "DOT", interval_kind: "days", interval_value: 360 })] }), OPCO);
    expect(row).toMatchObject({ interval_kind: "days", interval_days: 360, interval_miles: null, projected_due_date: null });
    expect(row.reason).toMatch(/days-interval/);
  });
  it("a real baseline projects from the unit's own rate and names the odometer source", async () => {
    const [row] = await computePmDueEngineForCompany(client({ live: true, stop: 440000, snap: 430000, schedules: [sched({ last_service_odometer: 420000 })] }), OPCO);
    expect(row).toMatchObject({ current_odometer: 440000, current_odometer_source: "unit_stop_events", miles_since_service: 20000, miles_to_due: 5000 });
    expect(row.projected_due_date).not.toBeNull();
  });
  it("no odometer anywhere: ABSENT reason, no due date", async () => {
    const [row] = await computePmDueEngineForCompany(client({ live: false, stop: null, snap: null, schedules: [sched({ last_service_odometer: 420000 })] }), OPCO);
    expect(row.current_odometer).toBeNull();
    expect(row.reason).toMatch(/ABSENT: E-03 pending/);
  });
});
