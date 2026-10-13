#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const repoRoot = process.cwd();
const migrationsDir = path.join(repoRoot, "db/migrations");
const UUID_REF_PATTERN = /REFERENCES\s+([\w."]+)\s*\(\s*uuid\s*\)/gi;

const uncomment = (source) => source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
const relationName = (name) => name.replaceAll('"', '').toLowerCase();

// Prove the referenced key from DDL instead of exempting an entire new file.
// A later rename/drop revokes the proof (notably identity.users uuid -> id).
function declaredUuidParents(sources) {
  const parents = new Set();
  for (const source of sources) {
    const sql = uncomment(source);
    for (const statement of sql.split(';')) {
      const create = statement.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w."]+)\s*\(/i);
      if (create) {
        const name = relationName(create[1]);
        const body = statement.slice(create.index + create[0].length);
        if (/(?:^|,)\s*"?uuid"?\s+uuid\s+(?:NOT\s+NULL\s+)?PRIMARY\s+KEY\b/i.test(body)) parents.add(name);
        else parents.delete(name);
      }
      const altered = statement.match(/ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?([\w."]+)\s+(?:RENAME\s+COLUMN\s+"?uuid"?\s+TO\b|DROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?"?uuid"?\b)/i);
      if (altered) parents.delete(relationName(altered[1]));
      const dropped = statement.match(/DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?([\w."]+)/i);
      if (dropped) parents.delete(relationName(dropped[1]));
    }
  }
  return parents;
}

function invalidReferences(source, parents) {
  return [...uncomment(source).matchAll(UUID_REF_PATTERN)].filter(match => !parents.has(relationName(match[1])));
}

if (process.argv.includes('--selftest')) {
  const ddl = 'CREATE TABLE reports.filing (uuid uuid PRIMARY KEY, company_id uuid);';
  const ref = 'ALTER TABLE reports.filing ADD prior uuid REFERENCES reports.filing(uuid);';
  assert.equal(invalidReferences(ref, declaredUuidParents([ddl])).length, 0);
  assert.equal(invalidReferences(ref, declaredUuidParents([ddl.replace('uuid uuid PRIMARY KEY', 'id uuid PRIMARY KEY')])).length, 1);
  assert.equal(invalidReferences(ref, declaredUuidParents(['-- ' + ddl])).length, 1);
  assert.equal(invalidReferences(ref, declaredUuidParents([ddl, 'ALTER TABLE reports.filing RENAME COLUMN uuid TO id;'])).length, 1);
  assert.equal(invalidReferences(ref, declaredUuidParents([ddl, 'ALTER TABLE reports.filing DROP COLUMN uuid;'])).length, 1);
  assert.equal(invalidReferences(ref, declaredUuidParents([ddl, 'DROP TABLE reports.filing;'])).length, 1);
  assert.equal(invalidReferences(ref.replace('REFERENCES reports.filing', 'REFERENCES identity.users'), declaredUuidParents([ddl])).length, 1);
  assert.equal(invalidReferences(ref + ' REFERENCES identity.users(uuid)', declaredUuidParents([ddl])).length, 1);
  console.log('verify:migrations-no-uuid-pk-reference SELFTEST PASS 8/8');
  process.exit(0);
}

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
  "202613390002_go20_d_cargo_sensor_incidents.sql", // dispatch.cargo_sensor_readings(uuid) --
  // verified against 202606080219_cargo_sensor_readings.sql line 5: `uuid uuid PRIMARY KEY`.
  // Its own PK (this file's incidents table) is `id`; only the two FKs into the sensor-readings
  // parent name that parent's real PK column, same pattern as the four files above.
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
const sources = new Map(entries.map(name => [name, fs.readFileSync(path.join(migrationsDir, name), 'utf8')]));
const uuidParents = declaredUuidParents(sources.values());
for (const name of entries) {
  if (LEGACY_ALLOWED_FILES.has(name)) continue;
  const matches = invalidReferences(sources.get(name), uuidParents);
  if (matches.length === 0) continue;
  failures.push(`${name}: contains REFERENCES ...(uuid) (${matches.length} match${matches.length === 1 ? "" : "es"})`);
}

if (failures.length > 0) fail(failures);
console.log("verify:migrations-no-uuid-pk-reference — OK");
