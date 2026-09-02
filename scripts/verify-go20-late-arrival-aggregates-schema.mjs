import fs from "node:fs";

const file = "db/migrations/202613390003_go20_late_arrival_aggregates.sql";
const sql = fs.readFileSync(file, "utf8");

function verify(text) {
  const columns = [
    "operating_company_id", "driver_id", "bucket_date", "stops_measured", "stops_late",
    "late_pct", "avg_minutes_late", "worst_minutes_late", "basis", "computed_at",
  ];
  return /CREATE TABLE IF NOT EXISTS dispatch\.late_arrival_aggregates/.test(text)
    && columns.every((column) => new RegExp(`\\b${column}\\b`).test(text))
    && /operating_company_id uuid NOT NULL REFERENCES org\.companies\(id\)/.test(text)
    && /driver_id uuid NOT NULL REFERENCES mdata\.drivers\(id\)/.test(text)
    && /CREATE UNIQUE INDEX IF NOT EXISTS uq_late_arrival_driver_day\s+ON dispatch\.late_arrival_aggregates \(operating_company_id, driver_id, bucket_date\)/.test(text)
    && /CREATE INDEX IF NOT EXISTS ix_late_arrival_recent\s+ON dispatch\.late_arrival_aggregates \(operating_company_id, bucket_date DESC\)/.test(text)
    && /ALTER TABLE dispatch\.late_arrival_aggregates FORCE ROW LEVEL SECURITY/.test(text)
    && /FOR ALL TO ih35_app/.test(text)
    && /GRANT SELECT, INSERT, UPDATE ON dispatch\.late_arrival_aggregates TO ih35_app/.test(text)
    && /REVOKE DELETE ON dispatch\.late_arrival_aggregates FROM ih35_app/.test(text)
    && !/INSERT INTO dispatch\.late_arrival_aggregates/.test(text);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    sql.replace("(operating_company_id, driver_id, bucket_date)", "(operating_company_id, bucket_date)"),
    sql.replace("FORCE ROW LEVEL SECURITY", "ENABLE ROW LEVEL SECURITY"),
    sql.replace("REFERENCES mdata.drivers(id)", "REFERENCES mdata.drivers(uuid)"),
    `${sql}\nINSERT INTO dispatch.late_arrival_aggregates DEFAULT VALUES;`,
  ];
  if (!verify(sql) || mutations.some(verify)) process.exit(1);
  console.log("verify-go20-late-arrival-aggregates-schema SELFTEST PASS — 4/4 planted regressions rejected");
  process.exit(0);
}
if (!verify(sql)) process.exit(1);
console.log("verify-go20-late-arrival-aggregates-schema PASS");
