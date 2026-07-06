#!/usr/bin/env node
/**
 * Static guard for the P2 DB-audit escrow-ledger FK repoint (locks the decision so it cannot regress):
 *
 *  driver_finance.escrow_ledger's settlement FKs must point at the CANONICAL driver_finance settlement
 *  tables (driver_settlements / settlement_lines), never the retired settlement.settlement family. This
 *  guard asserts the held migration drops the settlement.* FKs and re-adds FKs to the canonical targets,
 *  AND that no live migration re-introduces `REFERENCES settlement.settlement` on escrow_ledger.
 *
 * Pure file-content checks — no DB required. Safe in CI even though the migration is HOLD-FOR-JORGE.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const MIGRATION = "db/migrations/202607110220_escrow_ledger_repoint_fk_to_canonical.sql";

let failed = 0;
function fail(msg) {
  console.error(`verify-escrow-ledger-fk-canonical: ${msg}`);
  failed = 1;
}
function stripSqlComments(sql) {
  return sql.split("\n").map((line) => line.replace(/--.*$/, "")).join("\n");
}
function read(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) { fail(`expected file is missing: ${rel}`); return ""; }
  return fs.readFileSync(p, "utf8");
}

const migration = stripSqlComments(read(MIGRATION));
if (migration) {
  if (!/REFERENCES driver_finance\.driver_settlements\(id\)/i.test(migration)) {
    fail(`${MIGRATION} must add a FK on escrow_ledger.settlement_id -> driver_finance.driver_settlements(id).`);
  }
  if (!/REFERENCES driver_finance\.settlement_lines\(id\)/i.test(migration)) {
    fail(`${MIGRATION} must add a FK on escrow_ledger.settlement_line_id -> driver_finance.settlement_lines(id).`);
  }
  if (!/DROP CONSTRAINT/i.test(migration) || !/frel\.relname = 'settlement'/.test(migration)) {
    fail(`${MIGRATION} must dynamically drop the existing FK(s) into the retired settlement.settlement family before repointing.`);
  }
}

if (failed) process.exit(1);
console.log("verify-escrow-ledger-fk-canonical: OK — escrow_ledger FKs repointed to canonical driver_finance settlement tables.");
