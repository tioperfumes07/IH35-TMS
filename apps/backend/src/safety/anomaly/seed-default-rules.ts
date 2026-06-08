import type { Queryable } from "./types.js";

export const DEFAULT_ANOMALY_RULES = [
  { rule_slug: "duplicate_load_number", rule_name: "Duplicate Load Number", category: "integrity", detector_function: "duplicate_load_number", severity: "high", cadence_minutes: 360, threshold_config: {} },
  { rule_slug: "fuel_off_route_geo", rule_name: "Fuel Off-Route", category: "operational", detector_function: "fuel_off_route_geo", severity: "warn", cadence_minutes: 30, threshold_config: { max_route_deviation_miles: 25 } },
  { rule_slug: "dvir_major_open_unit", rule_name: "Open DVIR Major Defect", category: "security", detector_function: "dvir_major_open_unit", severity: "critical", cadence_minutes: 30, threshold_config: {} },
  { rule_slug: "inactive_driver_assignment", rule_name: "Inactive Driver On Load", category: "integrity", detector_function: "inactive_driver_assignment", severity: "critical", cadence_minutes: 30, threshold_config: {} },
  { rule_slug: "geofence_duplicate_fire", rule_name: "Geofence Duplicate Fire", category: "integrity", detector_function: "geofence_duplicate_fire", severity: "warn", cadence_minutes: 360, threshold_config: {} },
  { rule_slug: "pm_due_advisory", rule_name: "PM Due Advisory", category: "operational", detector_function: "pm_due_advisory", severity: "info", cadence_minutes: 360, threshold_config: { days_ahead: 14 } },
] as const;

export async function seedDefaultAnomalyRules(client: Queryable, operatingCompanyId: string) {
  for (const rule of DEFAULT_ANOMALY_RULES) {
    await client.query(
      `INSERT INTO safety.anomaly_alert_rules (
        operating_company_id, rule_slug, rule_name, category, detector_function,
        threshold_config, severity, notify_roles, cadence_minutes
      ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8::text[],$9)
      ON CONFLICT (operating_company_id, rule_slug) DO NOTHING`,
      [operatingCompanyId, rule.rule_slug, rule.rule_name, rule.category, rule.detector_function,
       JSON.stringify(rule.threshold_config), rule.severity, ["Owner","Administrator","Safety"], rule.cadence_minutes]
    );
  }
}
