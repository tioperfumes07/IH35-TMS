#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const migrationsDir = path.join(repoRoot, "db/migrations");
const UUID_REF_PATTERN = /REFERENCES\s+[\w."]+\s*\(\s*uuid\s*\)/gi;

// Historical exceptions where the parent key really is `uuid` or predates identity.users id rename.
const LEGACY_ALLOWED_FILES = new Set([
  "0004_identity_init.sql",
  "0050_two_section_v5_and_safety_restructure.sql",
  "0198_repair_work_order_lines_two_section_columns.sql",
  // Parent tables below define their PK literally as `uuid uuid PRIMARY KEY`,
  // so these FKs `REFERENCES <parent>(uuid)` are VALID (verified against the
  // CREATE TABLE in each file). Never grandfathered before only because this
  // guard never ran (arch-design runner poison-pill, now fixed). SQL is valid
  // and already applied — no corrective migration.
  "202606071500_edi_foundation.sql",             // integrations.edi_partners(uuid)
  "202606072351_recurring_bills.sql",            // accounting.recurring_bill_templates(uuid)
  "202606080206_scheduled_report_subscriptions.sql", // reports.scheduled_subscriptions(uuid)
  "202606080211_anomaly_alert_rules.sql",        // safety.anomaly_alert_rules(uuid)
]);

function fail(messages) {
  console.error("verify:migrations-no-uuid-pk-reference — FAILED");
  for (const message of messages) console.error(`- ${message}`);
  process.exit(1);
}

if (!fs.existsSync(migrationsDir)) {
  fail(["missing db/migrations directory"]);
}

const entries = fs
  .readdirSync(migrationsDir, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
  .map((entry) => entry.name)
  .sort();

const failures = [];
for (const name of entries) {
  if (LEGACY_ALLOWED_FILES.has(name)) continue;
  const fullPath = path.join(migrationsDir, name);
  const source = fs.readFileSync(fullPath, "utf8");
  const matches = [...source.matchAll(UUID_REF_PATTERN)];
  if (matches.length === 0) continue;
  failures.push(`${name}: contains REFERENCES ...(uuid) (${matches.length} match${matches.length === 1 ? "" : "es"})`);
}

if (failures.length > 0) fail(failures);
console.log("verify:migrations-no-uuid-pk-reference — OK");
