import { describe, expect, it, vi } from "vitest";
import { processMaintenancePredictorForOdometer } from "../maintenance-predictor.service.js";

describe("maintenance predictor dedup behavior", () => {
  it("does not create a second open alert for same schedule", async () => {
    const query = vi.fn(async (sql: string) => {
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
      if (sql.includes("FROM maintenance.pm_alerts")) return { rows: [{ id: "22222222-2222-2222-2222-222222222222" }] };
      if (sql.includes("INSERT INTO maintenance.pm_alerts")) return { rows: [] };
      return { rows: [] };
    });

    const result = await processMaintenancePredictorForOdometer(
      { query },
      {
        operating_company_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        unit_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        odometer_mi: 59800,
        occurred_at: "2026-05-23T21:00:00.000Z",
      }
    );

    expect(result.alerts_created).toBe(0);
  });
});
