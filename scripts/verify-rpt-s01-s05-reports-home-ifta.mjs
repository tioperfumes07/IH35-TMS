#!/usr/bin/env node
/**
 * RPT-S01 / RPT-S05 — Reports home surface ratchet.
 *
 * RPT-S01: /reports catalog hub lists 15+ reports across categories honestly.
 * RPT-S05: IFTA preparer due banner is honest (no fabricated countdown while loading).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = process.cwd();
const FILE = "apps/frontend/src/pages/reports/ReportsHome.tsx";
const CARD_FILE = "apps/frontend/src/components/reports/IftaPreparerCard.tsx";

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(ROOT, relativePath));
}

export function run() {
  const failures = [];
  if (!exists(FILE)) failures.push(`MISSING: ${FILE}`);
  if (!exists(CARD_FILE)) failures.push(`MISSING: ${CARD_FILE}`);
  if (failures.length) return failures;

  const homeSrc = read(FILE);
  const cardSrc = read(CARD_FILE);

  // RPT-S01
  if (!/CategoryHoverNav/.test(homeSrc)) {
    failures.push(`${FILE}: must render a category hover nav for report catalog`);
  }
  if (!/Accounting \+ financial reports/.test(homeSrc)) {
    failures.push(`${FILE}: must render an accounting/financial reports section`);
  }
  if (!/Management reports/.test(homeSrc)) {
    failures.push(`${FILE}: must render a management reports section`);
  }
  // Count explicit report rows in the two grid sections (12 accounting + 3 management = 15 minimum).
  const accountingSection = homeSrc.match(/Accounting \+ financial reports[\s\S]{0,3000}(?=Management reports)/)?.[0] ?? "";
  const mgmtSection = homeSrc.match(/Management reports[\s\S]{0,1500}(?=FrequentlyRunTable|ScheduledReportsPanel)/)?.[0] ?? "";
  const rowTupleRe = /\[["'][a-z-]+["'],\s*["'](?:[^"\\]|\\.)+["'](?:,\s*[^[\]]+)?\]/g;
  const accountingRows = (accountingSection.match(rowTupleRe) ?? []).length;
  const mgmtRows = (mgmtSection.match(rowTupleRe) ?? []).length;
  const totalRows = accountingRows + mgmtRows;
  if (totalRows < 15) {
    failures.push(`${FILE}: expected at least 15 report launch rows, found ${totalRows} (accounting=${accountingRows}, mgmt=${mgmtRows})`);
  }
  if (!/getKpiSummary\s*\(/.test(homeSrc)) {
    failures.push(`${FILE}: must call getKpiSummary for honest report KPIs`);
  }
  if (!/available_reports/.test(homeSrc)) {
    failures.push(`${FILE}: must surface available_reports KPI honestly`);
  }

  // RPT-S05
  if (!/IftaPreparerCard/.test(homeSrc)) {
    failures.push(`${HOME}: must render IftaPreparerCard on the reports home`);
  }
  if (!/getIftaStatus\s*\(/.test(homeSrc)) {
    failures.push(`${FILE}: must call getIftaStatus for IFTA due banner`);
  }
  if (!/daysUntilDue/.test(cardSrc)) {
    failures.push(`${CARD_FILE}: IftaPreparerCard must compute daysUntilDue from real status`);
  }
  if (/Loading…/.test(cardSrc) && !/—/.test(cardSrc)) {
    failures.push(`${CARD_FILE}: IftaPreparerCard must not show a false countdown while loading`);
  }

  return failures;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--selftest")) {
    const realPath = path.join(ROOT, FILE);
    const backup = fs.readFileSync(realPath, "utf8");
    try {
      fs.writeFileSync(realPath, backup.replace(/Accounting \+ financial reports/g, ""), "utf8");
      const planted = run();
      if (planted.length === 0) {
        console.error("[verify-rpt-s01-s05-reports-home-ifta] SELFTEST FAIL: planted missing section did not fail");
        process.exit(1);
      }
      console.log(`[verify-rpt-s01-s05-reports-home-ifta] SELFTEST PASS (${planted.length} planted failures detected)`);
    } finally {
      fs.writeFileSync(realPath, backup, "utf8");
    }
    process.exit(0);
  }

  const failures = run();
  if (failures.length > 0) {
    console.error("\n[verify-rpt-s01-s05-reports-home-ifta] FAILED:\n");
    for (const f of failures) {
      console.error(`  ✗ ${f}`);
    }
    process.exit(1);
  }
  console.log("[verify-rpt-s01-s05-reports-home-ifta] All checks passed ✓");
  process.exit(0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
