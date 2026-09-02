import fs from "node:fs";

const file = "db/migrations/202613390002_go20_d_cargo_sensor_incidents.sql";
const sql = fs.readFileSync(file, "utf8");

function verify(text) {
  const columns = [
    "operating_company_id", "load_id", "trailer_id", "unit_id", "driver_id", "customer_id",
    "sensor_id", "breach_kind", "started_at", "ended_at", "duration_minutes", "reading_count",
    "worst_value", "threshold_low", "threshold_high", "severity", "first_reading_uuid",
    "last_reading_uuid", "customer_notified_at", "claim_incident_id", "resolved_at",
    "resolved_by_user_id", "resolution_note", "voided_at", "voided_by_user_id", "void_reason",
    "is_sample_data", "created_at", "updated_at",
  ];
  return /CREATE TABLE IF NOT EXISTS dispatch\.cargo_sensor_incidents/.test(text)
    && columns.every((column) => new RegExp(`\\b${column}\\b`).test(text))
    && /first_reading_uuid uuid NULL REFERENCES dispatch\.cargo_sensor_readings\(uuid\)/.test(text)
    && /last_reading_uuid uuid NULL REFERENCES dispatch\.cargo_sensor_readings\(uuid\)/.test(text)
    && /uq_cargo_incident_open_per_sensor_kind/.test(text)
    && /ix_cargo_incident_open_critical/.test(text)
    && /FORCE ROW LEVEL SECURITY/.test(text)
    && /FOR ALL TO ih35_app/.test(text)
    && /GRANT SELECT, INSERT, UPDATE ON dispatch\.cargo_sensor_incidents TO ih35_app/.test(text)
    && /REVOKE DELETE ON dispatch\.cargo_sensor_incidents FROM ih35_app/.test(text)
    && !/INSERT INTO dispatch\.cargo_sensor_incidents/.test(text);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    sql.replace("cargo_sensor_readings(uuid)", "cargo_sensor_readings(id)"),
    sql.replace("FORCE ROW LEVEL SECURITY", "ENABLE ROW LEVEL SECURITY"),
    `${sql}\nINSERT INTO dispatch.cargo_sensor_incidents DEFAULT VALUES;`,
  ];
  if (!verify(sql) || mutations.some(verify)) process.exit(1);
  console.log("verify-go20-cargo-sensor-incidents-schema SELFTEST PASS — 3/3 planted regressions rejected");
  process.exit(0);
}
if (!verify(sql)) process.exit(1);
console.log("verify-go20-cargo-sensor-incidents-schema PASS");
