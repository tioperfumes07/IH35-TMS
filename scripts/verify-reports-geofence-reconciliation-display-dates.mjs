#!/usr/bin/env node
/**
 * verify-reports-geofence-reconciliation-display-dates.mjs
 * LV-REPORTS-GEOFENCE-RECONCILIATION-RAW-ISO-EMPTY-DATE
 *
 * ParityTable emptyText must display appliedDate via formatDateUS; API/query
 * state may keep raw ISO.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-reports-geofence-reconciliation-display-dates";
const PAGE = "apps/frontend/src/pages/reports/GeofenceReconciliationReport.tsx";

function read(rel) {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

function analyze(src) {
  const failures = [];
  if (!/formatDateUS/.test(src) || !/from ["']\.\.\/\.\.\/lib\/formatDate["']/.test(src)) {
    failures.push(`${PAGE}: must import formatDateUS`);
  }
  if (!/emptyText=\{`No anomalies found for \$\{formatDateUS\(appliedDate\)\}\.`\}/.test(src)) {
    failures.push(`${PAGE}: emptyText must interpolate formatDateUS(appliedDate), not raw appliedDate`);
  }
  if (/emptyText=\{`No anomalies found for \$\{appliedDate\}\.`\}/.test(src)) {
    failures.push(`${PAGE}: emptyText must not interpolate raw appliedDate ISO`);
  }
  // preserve ISO for API query
  if (!/date=\$\{appliedDate\}/.test(src) && !/date=\$\{encodeURIComponent\(appliedDate\)\}/.test(src) && !/&date=\$\{appliedDate\}/.test(src)) {
    // looser: appliedDate used in fetch URL
    if (!/geofences\/reconciliation[\s\S]{0,200}appliedDate/.test(src)) {
      failures.push(`${PAGE}: must still pass appliedDate (ISO) to the reconciliation query`);
    }
  }
  return failures;
}

function fail(msg) {
  console.error(`${LABEL} FAIL: ${msg}`);
  process.exit(1);
}

function selftest() {
  const pagePath = path.join(process.cwd(), PAGE);
  const original = fs.readFileSync(pagePath, "utf8");
  try {
    const planted = original.replace(
      /emptyText=\{`No anomalies found for \$\{formatDateUS\(appliedDate\)\}\.`\}/,
      "emptyText={`No anomalies found for ${appliedDate}.`}",
    );
    fs.writeFileSync(pagePath, planted);
    const bad = analyze(planted);
    if (!bad.some((m) => /raw appliedDate|formatDateUS\(appliedDate\)/.test(m))) {
      fail(`selftest expected raw emptyText interpolation to fail: ${bad.join("; ") || "none"}`);
    }
  } finally {
    fs.writeFileSync(pagePath, original);
  }
  const good = analyze(original);
  if (good.length) fail(`selftest expected GOOD after restore: ${good.join("; ")}`);
  console.log(`${LABEL} selftest PASS`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const failures = analyze(read(PAGE));
  if (failures.length) {
    for (const f of failures) console.error(`${LABEL} FAIL: ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} PASS — geofence recon emptyText uses formatDateUS (query ISO preserved)`);
}

main();
