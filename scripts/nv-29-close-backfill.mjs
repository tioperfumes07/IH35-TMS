#!/usr/bin/env node
// nv-29-close-backfill.mjs — NV-29-CLOSE: promote the last non-financial false-NV/PENDING blocks by writing
// their VERIFIED real artifacts into the registry the classifier reads. .block-ready blocks had empty
// allowed_files (registry blank) → populate allowed_files with present-on-main artifacts. The program block
// (HOS-BUG) gets the standard footer. Verifies every path on origin/main before writing — no fake paths. NO
// financial blocks (CASH-FLOW-MODULE left for gate). Idempotent.
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url"; import { execFileSync } from "node:child_process";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const main = new Set(execFileSync("git",["ls-tree","-r","origin/main","--name-only"],{cwd:ROOT,encoding:"utf8"}).split(/\r?\n/).filter(Boolean));
// .block-ready/<id>.json -> verified-present artifacts to set as allowed_files
const BR = {
  "BK7-INLINE-CREATE-DRAWERS": ["apps/frontend/src/components/parity/InlineCreateDrawer.tsx","apps/frontend/src/components/parity/drawers/NewAccountDrawerForm.tsx","apps/frontend/src/components/parity/drawers/NewVendorDrawerForm.tsx"],
  "BLOCK-I-CI-DIST-FIX": ["scripts/verify-no-duplicate-routes.mjs"],
  "BLOCK-J-MASTER-DATA-GRANT": ["db/migrations/202606072230_grant_master_data_schema_to_app.sql","scripts/verify-migration-filenames.mjs"],
  "PREREQ-A-SCHEMA-GRANT-GATE": ["scripts/verify-migration-schema-grants.mjs"],
  "FIX-REQUIRED-CHECKS-GATE": ["scripts/verify-ci-policy-applied.mjs"],
  "FIX-AUDIT-TRIGGER-DRIFT": ["db/migrations/202606080030_audit_trigger_drift_remediation.sql"],
};
let errs = [];
for (const [id, arts] of Object.entries(BR)) {
  const fp = path.join(ROOT, ".block-ready", `${id}.json`);
  if (!fs.existsSync(fp)) { errs.push(`missing ${id}.json`); continue; }
  const absent = arts.filter(a => !main.has(a));
  if (absent.length) { errs.push(`${id}: ABSENT ${absent.join(", ")}`); continue; }
  const j = JSON.parse(fs.readFileSync(fp, "utf8"));
  const cur = new Set(Array.isArray(j.allowed_files) ? j.allowed_files : []);
  arts.forEach(a => cur.add(a));
  j.allowed_files = [...cur];
  if (!j.evidence_note) j.evidence_note = "NV-29-CLOSE 2026-06-26: allowed_files backfilled with verified on-main artifacts (registry was blank; feature already built).";
  fs.writeFileSync(fp, JSON.stringify(j, null, 2) + "\n");
  console.log(`block-ready allowed_files -> ${id} (${arts.length})`);
}
// HOS-BUG (program) — footer (bug already fixed + guarded)
const MARK = "ARTIFACTS ON MAIN (evidence for reconcile classifier)";
const hb = path.join(ROOT, "docs/blocks/HOS-BUG-DRIVERASSIGN.txt");
const hbArts = ["scripts/verify-samsara-stats-types.mjs","apps/backend/src/integrations/samsara/samsara-client.ts"];
if (fs.existsSync(hb) && hbArts.every(a => main.has(a))) {
  let b = fs.readFileSync(hb, "utf8");
  if (!b.includes(MARK)) {
    fs.writeFileSync(hb, b.replace(/\s*$/, "") + `\n\n--- ${MARK} ---\nNV-29-CLOSE 2026-06-26: bug FIXED on main (Samsara stat-type uses valid types=gps,engineStates; invalid driverAssignments only in comments/response-parsing) + CI guard:\n` + hbArts.map(a=>`  - ${a}`).join("\n") + "\n");
    console.log("footer -> docs/blocks/HOS-BUG-DRIVERASSIGN.txt");
  }
} else errs.push("HOS-BUG artifact missing");
console.log(`\nerrors=${errs.length}`); errs.forEach(e=>console.error("ERR "+e));
process.exit(errs.length?1:0);
