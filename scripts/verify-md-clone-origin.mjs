#!/usr/bin/env node
// verify-md-clone-origin.mjs — MD-1/MD-2 regression guard (clone program, decision #7).
//
// The QBO clone pullers must (a) carry an EXPLICIT origin marker so cloned masterdata is distinguishable
// from TMS-created rows (the Section-B prerequisite before QBO_ENTITY_PUSH_ENABLED is ever on), and
// (b) VOID rows gone-from-QBO (void-not-delete) so the clone stays a faithful mirror. This guard fails CI
// if any of those invariants is removed:
//   1. a migration adds `origin` (default 'tms', CHECK ('tms','qbo_clone')) to mdata.customers + mdata.vendors.
//   2. customers-puller/vendors-puller stamp cloned rows origin='qbo_clone'.
//   3. both pullers have the guarded void-gone-from-QBO UPDATE (only origin='qbo_clone', only on a non-empty pull).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => { try { return fs.readFileSync(path.join(ROOT, p), "utf8"); } catch { return ""; } };

const migBlob = fs
  .readdirSync(path.join(ROOT, "db/migrations"))
  .filter((f) => f.endsWith(".sql"))
  .map((f) => read(`db/migrations/${f}`))
  .join("\n");

const errs = [];

// Owner-ruled fork: clone rows = source_system='qbo' + source='qbo_clone' (no ALTER to any existing CHECK).
for (const tbl of ["customers", "vendors"]) {
  if (!new RegExp(`ALTER TABLE mdata\\.${tbl}\\s+ADD COLUMN IF NOT EXISTS source_system`, "i").test(migBlob))
    errs.push(`migration must ADD COLUMN source_system to mdata.${tbl}`);
  if (!new RegExp(`ALTER TABLE mdata\\.${tbl}\\s+ADD COLUMN IF NOT EXISTS source\\b`, "i").test(migBlob))
    errs.push(`migration must ADD COLUMN source to mdata.${tbl}`);
}
if (!/CHECK\s*\(\s*source_system IN \('tms','qbo'\)\s*\)/i.test(migBlob))
  errs.push("source_system CHECK must pin ('tms','qbo')");

const pullers = {
  "apps/backend/src/qbo-sync/customers-puller.ts": "qbo_customer_id",
  "apps/backend/src/qbo-sync/vendors-puller.ts": "qbo_vendor_id",
};
for (const [file, idCol] of Object.entries(pullers)) {
  const src = read(file);
  if (!src) { errs.push(`missing ${file}`); continue; }
  if (!/source_system = 'qbo'/.test(src) || !/source = 'qbo_clone'/.test(src))
    errs.push(`${path.basename(file)} must stamp cloned rows source_system='qbo' + source='qbo_clone'`);
  // void-gone: a guarded UPDATE that deactivates source='qbo_clone' rows NOT in the pulled id set.
  if (!/pulledQboIds\.length\s*>\s*0/.test(src) || !new RegExp(`NOT \\(${idCol} = ANY`).test(src) || !/source = 'qbo_clone'/.test(src))
    errs.push(`${path.basename(file)} must void-gone-from-QBO (guarded UPDATE of source='qbo_clone' rows not in the pull)`);
}

if (errs.length) {
  console.error("verify:md-clone-origin — FAILED");
  for (const e of errs) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log("[md-clone-origin] OK — explicit origin marker + clone tagging + guarded void-gone-from-QBO intact.");
