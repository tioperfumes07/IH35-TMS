import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  evaluateIntegrityRulesForTenant,
  INTEGRITY_ALERT_ENGINE_VERSION,
  listIntegrityAlertRules,
} from "../integrity-alert-engine.service.js";

const COMPANY = "11111111-1111-4111-8111-111111111111";

describe("integrity alert engine service (A23-12)", () => {
  const query = vi.fn();

  beforeEach(() => {
    query.mockReset();
  });

  it("exports engine version", () => {
    expect(INTEGRITY_ALERT_ENGINE_VERSION).toBe("a23-12-v1");
  });

  it("lists rules for tenant", async () => {
    query.mockResolvedValueOnce({
      rows: [{ id: "r1", rule_code: "fuel_anomaly", enabled: true }],
      rowCount: 1,
    });
    const rows = await listIntegrityAlertRules({ query }, COMPANY);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.rule_code).toBe("fuel_anomaly");
  });

  it("evaluates fuel anomaly rule and inserts event + alert", async () => {
    query
      .mockResolvedValueOnce({
        rows: [
          {
            id: "rule-1",
            operating_company_id: COMPANY,
            rule_code: "fuel_anomaly",
            rule_name: "Fuel",
            source_view: "safety.v_fuel_mpg_anomalies",
            alert_category: "driver_mpg_anomaly",
            subject_type: "driver",
            threshold_config: { min_rows: 1 },
            severity: "warning",
            enabled: true,
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [{ driver_id: "d1", fuel_expense_id: "f1", anomaly_type: "too_low", operating_company_id: COMPANY }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [{ id: "evt-1", integrity_alert_id: null }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [{ id: "alert-1" }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const result = await evaluateIntegrityRulesForTenant({ query }, COMPANY);
    expect(result.rules_scanned).toBe(1);
    expect(result.events_inserted).toBe(1);
    expect(result.alerts_inserted).toBe(1);
  });

  it("skips alert insert when event already linked", async () => {
    query
      .mockResolvedValueOnce({
        rows: [
          {
            id: "rule-2",
            operating_company_id: COMPANY,
            rule_code: "gps_spoof_pattern",
            rule_name: "GPS",
            source_view: "safety.v_driver_dwell_outliers",
            alert_category: "driver_incident_frequency",
            subject_type: "driver",
            threshold_config: { min_minutes_over_avg: 120 },
            severity: "critical",
            enabled: true,
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [{ driver_id: "d2", minutes_over_avg: 200, operating_company_id: COMPANY }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [{ id: "evt-2", integrity_alert_id: "alert-existing" }],
        rowCount: 1,
      });

    const result = await evaluateIntegrityRulesForTenant({ query }, COMPANY);
    expect(result.events_inserted).toBe(1);
    expect(result.alerts_inserted).toBe(0);
  });
});
