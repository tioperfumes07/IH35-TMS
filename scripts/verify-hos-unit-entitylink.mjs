#!/usr/bin/env node
/** @matrix-built {"modules":["compliance"],"cols":["unit"],"leafRe":"^tab\\.hos_tracker$","task":"LINK-F5171-HOS-TRACKER-UNIT-DRILL","vertical":"column-wave"} */
/**
 * LINK-F5171 — compliance HOS tracker detail drawer + ELD live-duty unit column must
 * EntityLink unit_id (roster already returns it; detail subtitle used entityLabel(..., null)).
 *
 * Run: node scripts/verify-hos-unit-entitylink.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-hos-unit-entitylink";
const HOS = "apps/frontend/src/pages/compliance/HosTrackerSection.tsx";
const ELD = "apps/frontend/src/pages/eld/tabs/LiveDutyTab.tsx";

function audit(hosSrc, eldSrc) {
  const failures = [];
  if (/entityLabel\(selectedDriver\.unit_number,\s*null/.test(hosSrc)) {
    failures.push(`${HOS}: detail subtitle still entityLabel(unit, null)`);
  }
  if (!/data-testid=["']hos-tracker-detail-unit-link["']/.test(hosSrc)) {
    failures.push(`${HOS}: missing data-testid=hos-tracker-detail-unit-link`);
  }
  // Detail (not the table column) must bind selectedDriver.unit_id with kind=unit.
  if (!/kind=["']unit["'][\s\S]{0,80}id=\{selectedDriver\.unit_id\}/.test(hosSrc)) {
    failures.push(`${HOS}: detail must EntityLink kind=unit with selectedDriver.unit_id`);
  }
  if (/entityLabel\(row\.unit_number,\s*null/.test(eldSrc)) {
    failures.push(`${ELD}: unit column still entityLabel(..., null)`);
  }
  if (!/data-testid=["']eld-live-duty-unit-link["']/.test(eldSrc)) {
    failures.push(`${ELD}: missing data-testid=eld-live-duty-unit-link`);
  }
  if (!/kind=["']unit["'][\s\S]{0,80}id=\{row\.unit_id\}/.test(eldSrc)) {
    failures.push(`${ELD}: unit column must EntityLink kind=unit with row.unit_id`);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const hos = fs.readFileSync(path.join(ROOT, HOS), "utf8");
  const eld = fs.readFileSync(path.join(ROOT, ELD), "utf8");
  if (audit(hos, eld).length) {
    console.error(`${LABEL} SELFTEST FAIL — live files should pass`);
    process.exit(1);
  }
  const brokenHos = hos.replace(/kind=["']unit["']([\s\S]{0,80}id=\{selectedDriver\.unit_id\})/, 'kind="driver"$1');
  if (!audit(brokenHos, eld).length) {
    console.error(`${LABEL} SELFTEST FAIL — planted HOS detail kind regression not caught`);
    process.exit(1);
  }
  const brokenEld = eld.replace(/kind=["']unit["']([\s\S]{0,80}id=\{row\.unit_id\})/, 'kind="driver"$1');
  if (!audit(hos, brokenEld).length) {
    console.error(`${LABEL} SELFTEST FAIL — planted ELD unit kind regression not caught`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest OK`);
  process.exit(0);
}

const hos = fs.readFileSync(path.join(ROOT, HOS), "utf8");
const eld = fs.readFileSync(path.join(ROOT, ELD), "utf8");
const failures = audit(hos, eld);
if (failures.length) {
  console.error(`${LABEL} FAIL:`);
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log(`${LABEL} PASS — HOS tracker detail + ELD live-duty unit EntityLink`);
