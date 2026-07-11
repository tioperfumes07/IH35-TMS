#!/usr/bin/env node
// verify-bill-lines-load-id (P2-BILLLINE-LOADID / item 04)
// Asserts the bill_lines per-load-attribution linkage exists and points at the CANONICAL hub: migration
// 202607200000 must add accounting.bill_lines.load_id as a uuid FK -> mdata.loads (NOT a RETIRE table),
// mirroring accounting.expense_lines.load_id. Guards the migration from being weakened/removed or
// repointed. Self-test: --selftest.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIG = "db/migrations/202607200000_bill_lines_load_id.sql";

function read(rel) { return fs.readFileSync(path.join(ROOT, rel), "utf8"); }

export function check(sql) {
  const failures = [];
  // ADD COLUMN load_id ... REFERENCES mdata.loads  (idempotent + canonical hub)
  if (!/ALTER\s+TABLE\s+accounting\.bill_lines[\s\S]*?ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+load_id\s+uuid\s+REFERENCES\s+mdata\.loads\s*\(\s*id\s*\)/i.test(sql)) {
    failures.push("must ALTER accounting.bill_lines ADD COLUMN IF NOT EXISTS load_id uuid REFERENCES mdata.loads(id)");
  }
  // must NOT reference a RETIRE loads table (dispatch.loads etc.)
  if (/load_id\s+uuid\s+REFERENCES\s+dispatch\.loads/i.test(sql)) {
    failures.push("load_id FK must target the canonical mdata.loads, not dispatch.loads (RETIRE/verify)");
  }
  if (!/CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS[\s\S]*?bill_lines\s*\(\s*load_id\s*\)/i.test(sql)) {
    failures.push("must create a partial index on accounting.bill_lines (load_id)");
  }
  return failures;
}

export function run() {
  let sql;
  try { sql = read(MIG); } catch { return [`${MIG} not found — the P2-BILLLINE-LOADID migration must exist`]; }
  return check(sql);
}

if (process.argv.includes("--selftest")) {
  const good = `ALTER TABLE accounting.bill_lines ADD COLUMN IF NOT EXISTS load_id uuid REFERENCES mdata.loads(id);\nCREATE INDEX IF NOT EXISTS idx_bill_lines_load ON accounting.bill_lines (load_id) WHERE load_id IS NOT NULL;`;
  const noFk = `ALTER TABLE accounting.bill_lines ADD COLUMN IF NOT EXISTS load_id uuid;`;
  const wrongTarget = `ALTER TABLE accounting.bill_lines ADD COLUMN IF NOT EXISTS load_id uuid REFERENCES dispatch.loads(id);\nCREATE INDEX IF NOT EXISTS x ON accounting.bill_lines (load_id);`;
  const checks = [
    ["canonical FK + index passes", check(good).length === 0],
    ["missing FK is caught", check(noFk).length > 0],
    ["RETIRE dispatch.loads target is caught", check(wrongTarget).some((f) => /dispatch\.loads/.test(f))],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) { console.error("verify:bill-lines-load-id --selftest FAIL:"); for (const [n] of failed) console.error("  ✗ " + n); process.exit(1); }
  console.log(`verify:bill-lines-load-id --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const failures = run();
  if (failures.length) {
    console.error("verify:bill-lines-load-id FAIL:");
    for (const f of failures) console.error("  ✗ " + f);
    process.exit(1);
  }
  console.log("verify:bill-lines-load-id PASS (bill_lines.load_id FK -> mdata.loads + index present)");
}
