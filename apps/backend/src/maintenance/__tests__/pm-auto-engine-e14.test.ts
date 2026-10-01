import { describe, expect, it } from "vitest";
import { pmScheduleBaselineAbsentReason, runPmAutoEngineForTenant } from "../pm-auto-engine.service.js";

const OPCO = "00000000-0000-4000-8000-0000000000aa";
const UNIT = "00000000-0000-4000-8000-000000000001";

describe("E-14 baseline is READ or ABSENT, never guessed", () => {
  it("NULL baseline with no next_due is absent", () => {
    expect(pmScheduleBaselineAbsentReason({ interval_kind: "miles", last_service_odometer: null, next_due_odometer: null })).toMatch(/no baseline/);
  });
  it("the <= 1 placeholder is absent", () => {
    expect(pmScheduleBaselineAbsentReason({ interval_kind: "miles", last_service_odometer: 1, next_due_odometer: null })).toMatch(/no baseline/);
  });
  it("a real baseline or an explicit next_due evaluates", () => {
    expect(pmScheduleBaselineAbsentReason({ interval_kind: "miles", last_service_odometer: 400000, next_due_odometer: null })).toBeNull();
    expect(pmScheduleBaselineAbsentReason({ interval_kind: "miles", last_service_odometer: null, next_due_odometer: 425000 })).toBeNull();
  });
  it("a days interval has no last-service date to evaluate from", () => {
    expect(pmScheduleBaselineAbsentReason({ interval_kind: "days", last_service_odometer: null, next_due_odometer: null })).toMatch(/days-interval/);
  });
});

function engineClient(opts: { stopEventsLive: boolean; stopOdo: number | null; snapOdo: number | null; baseline: number | null; flag: boolean }) {
  const logs: Array<{ action: string; detail: Record<string, unknown> }> = [];
  const client = {
    query: async <T>(sql: string, values?: unknown[]): Promise<{ rows: T[] }> => {
      const rows = (x: unknown[]) => ({ rows: x as T[] });
      if (sql.includes("to_regclass")) {
        const rel = String(values?.[0]);
        return rows([{ ok: rel === "telematics.unit_stop_events" ? opts.stopEventsLive : true }]);
      }
      if (sql.includes("pm_auto_engine_settings")) return rows([{ is_paused: false }]);
      if (sql.includes("INSERT INTO maintenance.pm_schedule_runs")) return rows([{ id: "run-1" }]);
      if (sql.includes("FROM maintenance.pm_schedules")) {
        return rows([{ id: "s1", unit_id: UNIT, label: "PM-A", interval_kind: "miles", interval_value: 25000, last_service_odometer: opts.baseline, next_due_odometer: null }]);
      }
      if (sql.includes("FROM telematics.unit_stop_events")) return rows(opts.stopOdo == null ? [] : [{ unit_id: UNIT, odometer_mi: opts.stopOdo, read_at: "2026-10-01 01:00:00+00" }]);
      if (sql.includes("FROM telematics.odometer_readings")) return rows(opts.snapOdo == null ? [] : [{ unit_id: UNIT, odometer_miles: opts.snapOdo, read_at: "2026-09-30 19:45:00+00" }]);
      if (sql.includes("FROM lib.feature_flags")) return rows(opts.flag ? [{ flag_key: "PM_AUTO_ENGINE_CREATE_WORK_ORDERS", default_enabled: true, rollout_pct: 0, archived_at: null }] : []);
      if (sql.includes("lib.feature_flag_overrides")) return rows([]);
      if (sql.includes("INSERT INTO maintenance.pm_auto_wo_log")) {
        const action = (values ?? []).find((v) => typeof v === "string" && /^(skipped_|due_|wo_|near_)/.test(v)) as string;
        const detailRaw = (values ?? []).find((v) => typeof v === "string" && v.startsWith("{"));
        logs.push({ action, detail: detailRaw ? JSON.parse(detailRaw as string) : {} });
        return rows([]);
      }
      if (sql.includes("work_orders") && sql.includes("SELECT")) return rows([]);
      return rows([]);
    },
  };
  return { client, logs };
}

describe("E-14 odometer source order: unit_stop_events -> odometer_readings -> ABSENT", () => {
  it("E-03 pending: falls through to the snapshot and records the source", async () => {
    const { client, logs } = engineClient({ stopEventsLive: false, stopOdo: null, snapOdo: 455164, baseline: null, flag: false });
    await runPmAutoEngineForTenant(client as never, OPCO);
    expect(logs[0]).toMatchObject({ action: "skipped_no_baseline" });
    expect(logs[0].detail).toMatchObject({ current_odometer: 455164, odometer_source: "odometer_readings" });
  });

  it("unit_stop_events wins over the snapshot when live", async () => {
    const { client, logs } = engineClient({ stopEventsLive: true, stopOdo: 455487.2, snapOdo: 455164, baseline: null, flag: false });
    await runPmAutoEngineForTenant(client as never, OPCO);
    expect(logs[0].detail).toMatchObject({ current_odometer: 455487, odometer_source: "unit_stop_events" });
  });

  it("no odometer anywhere is ABSENT with a reason naming E-03 pending -- never 0", async () => {
    const { client, logs } = engineClient({ stopEventsLive: false, stopOdo: null, snapOdo: null, baseline: 400000, flag: false });
    await runPmAutoEngineForTenant(client as never, OPCO);
    expect(logs[0].action).toBe("skipped_no_odometer");
    expect(String(logs[0].detail.reason)).toMatch(/E-03 pending/);
  });

  it("due with the flag OFF logs due_wo_flag_off and creates no work order", async () => {
    const { client, logs } = engineClient({ stopEventsLive: false, stopOdo: null, snapOdo: 430000, baseline: 400000, flag: false });
    const out = await runPmAutoEngineForTenant(client as never, OPCO);
    expect(logs.map((l) => l.action)).toContain("due_wo_flag_off");
    expect(out.work_orders_created).toBe(0);
  });
});
