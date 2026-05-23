import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = path.resolve(".");
const MIGRATIONS_DIR = path.join(ROOT, "db/migrations");
const OUTPUT_PATH = path.join(ROOT, "scripts/safe-replay-0199-to-0214.sql");
const APPLIED_BY = "claude-replay-2026-05-22";

const FILES = [
  "0199_ds_remediate_admin_jobs_queue.sql",
  "0200_ds_remediate_reconciliation_findings.sql",
  "0201_ds_remediate_qbo_remote_counts_canonical.sql",
  "0202_ds_remediate_reconciliation_state.sql",
  "0203_ds_remediate_samsara_webhook_projection_state.sql",
  "0204_ds_remediate_qbo_accounts_contract_alignment.sql",
  "0205_ds_remediate_qbo_classes_contract_alignment.sql",
  "0206_ds_remediate_qbo_customers_contract_alignment.sql",
  "0207_ds_remediate_qbo_items_contract_alignment.sql",
  "0208_ds_remediate_qbo_vendors_contract_alignment.sql",
  "0209_ds_remediate_samsara_drivers_contract_alignment.sql",
  "0210_ds_remediate_samsara_vehicles_contract_alignment.sql",
  "0211_ds_remediate_samsara_remote_counts.sql",
  "0212_ds_remediate_alert_routing.sql",
  "0213_ds_remediate_8_1_real_canonical_columns.sql",
  "0214_qbo_mdata_handler_reconciliation_orphan_cleanup.sql",
];

function sha256(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

function sqlLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function stripTransactionWrappers(sql) {
  const lines = sql.split(/\r?\n/);
  const beginIdx = lines.findIndex((line) => /^\s*BEGIN;\s*$/i.test(line));
  if (beginIdx >= 0) lines.splice(beginIdx, 1);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (/^\s*COMMIT;\s*$/i.test(lines[i])) {
      lines.splice(i, 1);
      break;
    }
    if (lines[i].trim() !== "") break;
  }
  return `${lines.join("\n").replace(/\s+$/, "")}\n`;
}

const out = [];
out.push("-- SAFE_REPLAY.sql generated for strict historical replay of 0199-0214");
out.push("-- Source migrations are replayed in-order with original statement bodies.");
out.push("-- BEGIN/COMMIT wrappers from each migration are removed for a single atomic transaction.");
out.push("-- Ledger rows are inserted using db-migrate.mjs-compatible SHA256 checksums.");
out.push("BEGIN;");
out.push("");

for (const filename of FILES) {
  const migrationPath = path.join(MIGRATIONS_DIR, filename);
  const raw = fs.readFileSync(migrationPath, "utf8");
  const checksum = sha256(raw);
  const body = stripTransactionWrappers(raw).trimEnd();

  out.push(`-- >>> ${filename}`);
  out.push(`-- checksum(sha256): ${checksum}`);
  out.push(body);
  out.push("");
  out.push("INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)");
  out.push(
    `VALUES (${sqlLiteral(filename)}, ${sqlLiteral(checksum)}, now(), ${sqlLiteral(APPLIED_BY)}, 0) ON CONFLICT (filename) DO NOTHING;`
  );
  out.push("INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)");
  out.push(`VALUES (${sqlLiteral(filename)}, now(), ${sqlLiteral(APPLIED_BY)}) ON CONFLICT (name) DO NOTHING;`);
  out.push("");
}

out.push("COMMIT;");
out.push("");

fs.writeFileSync(OUTPUT_PATH, out.join("\n"), "utf8");
console.log(`Generated ${path.relative(ROOT, OUTPUT_PATH)} (${FILES.length} migrations).`);
