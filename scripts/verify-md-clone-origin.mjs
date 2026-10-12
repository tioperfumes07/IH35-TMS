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

// ACCT-F4431380 (Lead 443.137 item 9e) — OLD: customers-puller / vendors-puller had to UPSERT native
//   mdata.customers / mdata.vendors stamped source_system='qbo' + source='qbo_clone', and run a guarded
//   void-gone-from-QBO UPDATE of those native rows.
//   NEW: a QBO pull writes ONLY its mirror (mdata.qbo_customers / mdata.qbo_vendors). The pullers must contain
//   no INSERT/UPDATE/DELETE of native mdata.customers / mdata.vendors at all (so no clone stamping and no
//   void-gone mutation of native rows), and must still upsert their mirror. The origin-marker migrations above
//   are kept: they still classify the existing frozen clone rows.
//   WHY: QuickBooks is a read-only archive; the projection/write was removed and its entry point refuses by name.
const pullers = {
  "apps/backend/src/qbo-sync/customers-puller.ts": { native: "customers", mirror: "qbo_customers" },
  "apps/backend/src/qbo-sync/vendors-puller.ts": { native: "vendors", mirror: "qbo_vendors" },
};
export function checkPuller(file, src, { native, mirror }) {
  const out = [];
  if (!src) return [`missing ${file}`];
  if (new RegExp(`(?:INSERT\\s+INTO|UPDATE|DELETE\\s+FROM)\\s+mdata\\.${native}\\b`, "i").test(src))
    out.push(`${path.basename(file)} must not write native mdata.${native} (no clone upsert, no void-gone) — QuickBooks is a read-only archive`);
  if (!new RegExp(`INSERT\\s+INTO\\s+mdata\\.${mirror}\\b`, "i").test(src))
    out.push(`${path.basename(file)} must still upsert its mirror mdata.${mirror}`);
  return out;
}
for (const [file, spec] of Object.entries(pullers)) errs.push(...checkPuller(file, read(file), spec));

if (process.argv.includes("--selftest")) {
  const st = [];
  for (const [file, spec] of Object.entries(pullers)) {
    const real = read(file);
    if (checkPuller(file, real, spec).length) st.push(`real ${file} flagged`);
    const plantUpsert = real + `\nconst P = \`INSERT INTO mdata.${spec.native} (operating_company_id, source) VALUES ($1, 'qbo_clone')\`;\n`;
    if (!checkPuller(file, plantUpsert, spec).length) st.push(`planted native clone upsert in ${file} not caught`);
    const plantVoid = real + `\nconst V = \`UPDATE mdata.${spec.native} SET deactivated_at = now() WHERE source = 'qbo_clone'\`;\n`;
    if (!checkPuller(file, plantVoid, spec).length) st.push(`planted native void-gone in ${file} not caught`);
  }
  if (st.length) { console.error("verify:md-clone-origin --selftest FAILED"); for (const e of st) console.error(`  ✗ ${e}`); process.exit(1); }
  console.log("verify:md-clone-origin --selftest PASS");
  process.exit(0);
}

if (errs.length) {
  console.error("verify:md-clone-origin — FAILED");
  for (const e of errs) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log("[md-clone-origin] OK — origin marker migrations intact; QBO customer/vendor pullers write only their mirror (9e).");
