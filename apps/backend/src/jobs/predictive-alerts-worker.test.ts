import { describe, expect, it, vi } from "vitest";
import { runPredictiveAlertsWorkerTick, WARNING_HORIZON_DAYS, CRITICAL_HORIZON_DAYS } from "./predictive-alerts-worker.js";

const COMPANY_ID = "11111111-1111-1111-1111-111111111111";
const UNIT_ID = "22222222-2222-2222-2222-222222222222";
const SOURCE_UUID = "33333333-3333-3333-3333-333333333333";

function isoDaysFromNow(days: number): string {
  const d = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

/** Builds a fake DB client. `existingAlertRows` controls whether the "does an open alert already
 * exist for this position" lookup returns a row (update path) or not (insert path). Every write
 * (INSERT/UPDATE) is recorded so the test can assert exactly what was written. */
function makeClient(opts: {
  brakeRows?: Array<Record<string, unknown>>;
  tireRows?: Array<Record<string, unknown>>;
  existingAlertRows?: Array<Record<string, unknown>>;
  completedWorkOrderCloses?: Array<{ id: string }>;
}) {
  const inserts: Array<{ sql: string; values: unknown[] }> = [];
  const updates: Array<{ sql: string; values: unknown[] }> = [];

  const query = vi.fn(async (sql: string, values: unknown[] = []) => {
    if (sql.includes("to_regclass($1)")) {
      // relationExists — predictive_alerts, brake_projections, tire_projections all "exist" in tests.
      return { rows: [{ ok: true }] };
    }
    if (sql.includes("FROM org.companies")) {
      return { rows: [{ id: COMPANY_ID }] };
    }
    if (sql.includes("set_config('app.operating_company_id'")) {
      return { rows: [] };
    }
    if (sql.includes("FROM maintenance.brake_projections")) {
      return { rows: opts.brakeRows ?? [] };
    }
    if (sql.includes("FROM maintenance.tire_projections")) {
      return { rows: opts.tireRows ?? [] };
    }
    if (sql.includes("FROM maintenance.predictive_alerts") && sql.includes("SELECT id::text")) {
      return { rows: opts.existingAlertRows ?? [] };
    }
    if (sql.trim().startsWith("INSERT INTO maintenance.predictive_alerts")) {
      inserts.push({ sql, values });
      return { rows: [] };
    }
    if (sql.trim().startsWith("UPDATE maintenance.predictive_alerts a") || sql.includes("FROM maintenance.work_orders wo")) {
      updates.push({ sql, values });
      return { rows: opts.completedWorkOrderCloses ?? [] };
    }
    if (sql.trim().startsWith("UPDATE maintenance.predictive_alerts")) {
      updates.push({ sql, values });
      return { rows: [] };
    }
    return { rows: [] };
  });

  return { client: { query }, inserts, updates };
}

describe("predictive-alerts-worker", () => {
  it("opens exactly one alert for a brake projection inside the warning horizon", async () => {
    const { client, inserts } = makeClient({
      brakeRows: [
        {
          source_uuid: SOURCE_UUID,
          unit_uuid: UNIT_ID,
          position_code: "front_left",
          current_measure: 4.2,
          threshold_measure: 3.0,
          projected_replacement_date: isoDaysFromNow(WARNING_HORIZON_DAYS - 1),
        },
      ],
      existingAlertRows: [],
    });

    const result = await runPredictiveAlertsWorkerTick({ withLuciaBypassImpl: async (fn) => fn(client as never) });

    expect(result.opened).toBe(1);
    expect(inserts).toHaveLength(1);
    expect(inserts[0].values).toContain("brake_wear");
    expect(inserts[0].values).toContain("front_left");
  });

  it("does not open an alert for a projection outside the horizon", async () => {
    const { client, inserts } = makeClient({
      brakeRows: [
        {
          source_uuid: SOURCE_UUID,
          unit_uuid: UNIT_ID,
          position_code: "front_left",
          current_measure: 6.0,
          threshold_measure: 3.0,
          projected_replacement_date: isoDaysFromNow(WARNING_HORIZON_DAYS + 30),
        },
      ],
      existingAlertRows: [],
    });

    const result = await runPredictiveAlertsWorkerTick({ withLuciaBypassImpl: async (fn) => fn(client as never) });

    expect(result.opened).toBe(0);
    expect(inserts).toHaveLength(0);
  });

  it("closes an open alert when a newer projection clears it (measurement improves outside horizon)", async () => {
    const { client, updates } = makeClient({
      brakeRows: [
        {
          source_uuid: SOURCE_UUID,
          unit_uuid: UNIT_ID,
          position_code: "front_left",
          current_measure: 6.0,
          threshold_measure: 3.0,
          projected_replacement_date: isoDaysFromNow(WARNING_HORIZON_DAYS + 30),
        },
      ],
      existingAlertRows: [{ id: "44444444-4444-4444-4444-444444444444" }],
    });

    const result = await runPredictiveAlertsWorkerTick({ withLuciaBypassImpl: async (fn) => fn(client as never) });

    expect(result.cleared).toBe(1);
    const resolveCall = updates.find((u) => u.sql.includes("auto-cleared"));
    expect(resolveCall).toBeTruthy();
  });

  it("marks severity critical inside the critical horizon, warning otherwise", async () => {
    const { client, inserts } = makeClient({
      brakeRows: [
        {
          source_uuid: SOURCE_UUID,
          unit_uuid: UNIT_ID,
          position_code: "front_left",
          current_measure: 3.5,
          threshold_measure: 3.0,
          projected_replacement_date: isoDaysFromNow(CRITICAL_HORIZON_DAYS - 1),
        },
      ],
      existingAlertRows: [],
    });

    await runPredictiveAlertsWorkerTick({ withLuciaBypassImpl: async (fn) => fn(client as never) });

    expect(inserts[0].values).toContain("critical");
  });

  it("only ever writes alert_type brake_wear or tire_tread (never a third value)", async () => {
    const { client, inserts } = makeClient({
      brakeRows: [
        {
          source_uuid: SOURCE_UUID,
          unit_uuid: UNIT_ID,
          position_code: "front_left",
          current_measure: 4.2,
          threshold_measure: 3.0,
          projected_replacement_date: isoDaysFromNow(1),
        },
      ],
      tireRows: [
        {
          source_uuid: "55555555-5555-5555-5555-555555555555",
          unit_uuid: UNIT_ID,
          position_code: "steer_left",
          current_measure: 4,
          threshold_measure: 2,
          projected_replacement_date: isoDaysFromNow(1),
        },
      ],
      existingAlertRows: [],
    });

    await runPredictiveAlertsWorkerTick({ withLuciaBypassImpl: async (fn) => fn(client as never) });

    expect(inserts).toHaveLength(2);
    const alertTypesWritten = inserts.map((row) => row.values.find((v) => v === "brake_wear" || v === "tire_tread"));
    for (const t of alertTypesWritten) {
      expect(["brake_wear", "tire_tread"]).toContain(t);
    }
  });

  it("auto-closes an alert whose linked work order has completed", async () => {
    const { client, updates } = makeClient({
      brakeRows: [],
      existingAlertRows: [],
      completedWorkOrderCloses: [{ id: "66666666-6666-6666-6666-666666666666" }],
    });

    const result = await runPredictiveAlertsWorkerTick({ withLuciaBypassImpl: async (fn) => fn(client as never) });

    expect(result.autoClosed).toBe(1);
    const woCloseCall = updates.find((u) => u.sql.includes("wo.status IN ('complete', 'completed')"));
    expect(woCloseCall).toBeTruthy();
  });
});
