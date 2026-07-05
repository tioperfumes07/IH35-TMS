#!/usr/bin/env node
// verify-fk-integrity-fault-da-records.mjs
// Static regression guard (2026-07-07, connectivity-sweep FK closures). Confirms the four
// referential-integrity FKs added by 202607070000_fk_integrity_fault_history_da_records.sql are
// still present in the migration ledger, so a future edit/revert of that file can't silently
// re-open these orphan paths (fault-history -> unit/auto-WO, D&A test/enrollment -> driver)
// without CI catching it. Static text scan — no DB connection required, mirrors the pattern used
// by verify-schema-parity.mjs / verify-mdata-phantom-columns.mjs.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-fk-integrity-fault-da-records";
const MIG_DIR = path.join(ROOT, "db/migrations");

// Each required FK: constraint name -> [owning table, referenced table] (as they must co-occur
// within a single ADD CONSTRAINT statement somewhere in the migration ledger).
const REQUIRED_FKS = [
  {
    name: "fk_fault_history_unit",
    table: "maintenance.samsara_fault_code_history",
    references: "mdata.units",
  },
  {
    name: "fk_fault_history_auto_wo",
    table: "maintenance.samsara_fault_code_history",
    references: "maintenance.work_orders",
  },
  {
    name: "fk_da_test_records_driver",
    table: "safety.da_test_records",
    references: "mdata.drivers",
  },
  {
    name: "fk_da_enrollments_driver",
    table: "safety.da_program_enrollments",
    references: "mdata.drivers",
  },
];

const files = fs.readdirSync(MIG_DIR).filter((f) => f.endsWith(".sql"));
const corpus = files
  .map((f) => `-- FILE: ${f}\n${fs.readFileSync(path.join(MIG_DIR, f), "utf8")}`)
  .join("\n");

const errs = [];
for (const fk of REQUIRED_FKS) {
  // Look for "ADD CONSTRAINT <name> ... FOREIGN KEY (...) REFERENCES <references>" anywhere in the
  // ledger (allows whitespace/newlines between clauses; case-insensitive).
  const re = new RegExp(
    `ADD\\s+CONSTRAINT\\s+${fk.name}[\\s\\S]{0,200}?FOREIGN\\s+KEY[\\s\\S]{0,120}?REFERENCES\\s+${fk.references.replace(".", "\\.")}\\s*\\(`,
    "i"
  );
  if (!re.test(corpus)) {
    errs.push(
      `${fk.name} (${fk.table} -> ${fk.references}) not found in db/migrations/* — this FK closure has regressed (removed/renamed). See 202607070000_fk_integrity_fault_history_da_records.sql.`
    );
  }
}

if (errs.length) {
  console.error(`[${LABEL}] FAILED — ${errs.length} issue(s):`);
  for (const e of errs) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — all ${REQUIRED_FKS.length} FK integrity closures present in the migration ledger.`);
