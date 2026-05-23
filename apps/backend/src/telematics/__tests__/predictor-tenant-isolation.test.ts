import { describe, expect, it, vi } from "vitest";
import { processMaintenancePredictorForOdometer } from "../maintenance-predictor.service.js";

describe("maintenance predictor tenant isolation", () => {
  it("filters schedules and alerts by operating_company_id", async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const query = vi.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (sql.includes("to_regclass")) return { rows: [{ ok: true }] };
      if (sql.includes("FROM maintenance.pm_schedules")) {
        return {
          rows: [
            {
              id: "11111111-1111-1111-1111-111111111111",
              interval_kind: "miles",
              interval_value: 10000,
              last_service_odometer: 50000,
              next_due_odometer: 60000,
            },
          ],
        };
      }
      if (sql.includes("FROM maintenance.pm_alerts")) return { rows: [] };
      if (sql.includes("INSERT INTO maintenance.pm_alerts")) return { rows: [{ id: "33333333-3333-3333-3333-333333333333" }] };
      return { rows: [] };
    });

    await processMaintenancePredictorForOdometer(
      { query },
      {
        operating_company_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        unit_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        odometer_mi: 59800,
        occurred_at: "2026-05-23T21:00:00.000Z",
      }
    );

    const scheduleCall = calls.find((call) => call.sql.includes("FROM maintenance.pm_schedules"));
    expect(scheduleCall?.sql).toContain("operating_company_id = $1::uuid");
    expect(scheduleCall?.params[0]).toBe("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");

    const insertCall = calls.find((call) => call.sql.includes("INSERT INTO maintenance.pm_alerts"));
    expect(insertCall?.params[0]).toBe("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
  });
});
