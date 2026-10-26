#!/usr/bin/env node
/**
 * RPT-S01 / RPT-S05 — Reports home surface ratchet.
 *
 * RPT-S01: /reports catalog hub lists 15+ reports across categories honestly.
 * RPT-S05: IFTA preparer due banner is honest (no fabricated countdown while loading).
 *
 * ROUND 443.267 — Accounting + financial rows live on ReportsHomeBoard; Management stays on hub.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = process.cwd();
const FILE = "apps/frontend/src/pages/reports/ReportsHome.tsx";
const BOARD = "apps/frontend/src/pages/reports/components/ReportsHomeBoard.tsx";
const CARD_FILE = "apps/frontend/src/components/reports/IftaPreparerCard.tsx";

function read(relativePath, root = ROOT) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function exists(relativePath, root = ROOT) {
  return fs.existsSync(path.join(root, relativePath));
}

export function run(root = ROOT) {
  const failures = [];
  if (!exists(FILE, root)) failures.push(`MISSING: ${FILE}`);
  if (!exists(BOARD, root)) failures.push(`MISSING: ${BOARD}`);
  if (!exists(CARD_FILE, root)) failures.push(`MISSING: ${CARD_FILE}`);
  if (failures.length) return failures;

  const homeSrc = read(FILE, root);
  const boardSrc = read(BOARD, root);
  const cardSrc = read(CARD_FILE, root);

  // FINAL-3 row 40 (#27715, owner v3 rebuild — docs/design/v3/Reports.dc.html): the hub content moved from the
  // ReportsHome shell into ReportsHomeBoard, and the category hover nav became the v3 category sidebar. The hub is
  // judged as the rendered pair (shell + board); each requirement below is unchanged in substance.
  const hubSrc = `${homeSrc}\n${boardSrc}`;
  // RPT-S01
  const v3CategoryNav = /SIDEBAR_CATEGORIES\.map\(/.test(boardSrc) && /aria-label="Report categories"/.test(boardSrc);
  if (!/CategoryHoverNav/.test(homeSrc) && !v3CategoryNav) {
    failures.push(`${FILE}: must render a category hover nav for report catalog`);
  }
  if (!/ReportsHomeBoard/.test(homeSrc)) {
    failures.push(`${FILE}: must mount ReportsHomeBoard`);
  }
  if (!/Accounting \+ financial reports/.test(boardSrc) && !/title="Accounting &amp; financial"/.test(boardSrc)) {
    failures.push(`${BOARD}: must render an accounting/financial reports section`);
  }
  if (!/Management reports/.test(hubSrc)) {
    failures.push(`${FILE}: must render a management reports section`);
  }
  if (/QBO-standard branded compilations/.test(hubSrc)) {
    failures.push(`${FILE}: USMCA-visible management report copy must not claim a QBO standard`);
  }
  if (!/Branded financial compilations/.test(hubSrc)) {
    failures.push(`${FILE}: management report copy must describe the TMS-native branded compilation`);
  }
  // Count explicit report rows: board accounting tuples + hub management ids (15 minimum).
  const rowTupleRe = /\[["'][a-z-]+["'],\s*["'](?:[^"\\]|\\.)+["'](?:,\s*[^[\]]+)?\]/g;
  const accountingRows = (boardSrc.match(rowTupleRe) ?? []).length;
  const managementReportIds = ["company-overview", "sales-performance", "expenses-performance"];
  const mgmtSection = homeSrc.match(/Management reports[\s\S]{0,2500}(?=FrequentlyRunTable|ScheduledReportsPanel)/)?.[0] ?? "";
  // On the v3 board the Management rows are the MANAGEMENT_ROWS table rendered inside the Management panel.
  const boardMgmt = /MANAGEMENT_ROWS\.map\(/.test(boardSrc) && /Management reports/.test(boardSrc)
    ? (boardSrc.match(/const MANAGEMENT_ROWS = \[[\s\S]*?\] as const;/)?.[0] ?? "")
    : "";
  const mgmtRows = managementReportIds.filter((id) => mgmtSection.includes(`"${id}"`) || boardMgmt.includes(`"${id}"`)).length;
  const totalRows = accountingRows + mgmtRows;
  if (totalRows < 15) {
    failures.push(`${FILE}+${BOARD}: expected at least 15 report launch rows, found ${totalRows} (accounting=${accountingRows}, mgmt=${mgmtRows})`);
  }
  if (!/getKpiSummary\s*\(/.test(boardSrc)) {
    failures.push(`${BOARD}: must call getKpiSummary for honest report KPIs`);
  }
  if (!/available_reports/.test(boardSrc)) {
    failures.push(`${BOARD}: must surface available_reports KPI honestly`);
  }

  // RPT-S05
  if (!/<IftaPreparerCard\b/.test(hubSrc)) {
    failures.push(`${FILE}: must render IftaPreparerCard on the reports home`);
  }
  if (!/getIftaStatus\s*\(/.test(homeSrc) && !/getIftaStatus\s*\(/.test(boardSrc)) {
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
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "verify-rpt-s01-s05-reports-home-ifta-selftest-"));
    for (const rel of [FILE, BOARD, CARD_FILE]) {
      fs.mkdirSync(path.dirname(path.join(tmpRoot, rel)), { recursive: true });
      fs.writeFileSync(path.join(tmpRoot, rel), read(rel), "utf8");
    }
    const boardPath = path.join(tmpRoot, BOARD);
    const homePath = path.join(tmpRoot, FILE);
    const boardBackup = fs.readFileSync(boardPath, "utf8");
    const homeBackup = fs.readFileSync(homePath, "utf8");
    try {
      fs.writeFileSync(path.join(tmpRoot, BOARD), boardBackup.replace(/Accounting \+ financial reports/g, "").replace('title="Accounting &amp; financial"', 'title="Reports"'), "utf8");
      const planted = run(tmpRoot);
      if (planted.length === 0) {
        console.error("[verify-rpt-s01-s05-reports-home-ifta] SELFTEST FAIL: planted missing section did not fail");
        process.exit(1);
      }
      fs.writeFileSync(path.join(tmpRoot, BOARD), boardBackup, "utf8");
      fs.writeFileSync(path.join(tmpRoot, FILE), homeBackup, "utf8");
      fs.writeFileSync(path.join(tmpRoot, BOARD), boardBackup.replace("Branded financial compilations", "QBO-standard branded compilations"), "utf8");
      const qboCopyPlanted = run(tmpRoot);
      if (!qboCopyPlanted.some((failure) => failure.includes("must not claim a QBO standard"))) {
        console.error("[verify-rpt-s01-s05-reports-home-ifta] SELFTEST FAIL: planted QBO copy did not fail");
        process.exit(1);
      }
      // Planted original S05 defect: the IFTA preparer card dropped from the hub.
      fs.writeFileSync(path.join(tmpRoot, BOARD), boardBackup.replace(/<IftaPreparerCard\b[^>]*\/>/g, "null"), "utf8");
      if (!run(tmpRoot).some((failure) => failure.includes("IftaPreparerCard"))) {
        console.error("[verify-rpt-s01-s05-reports-home-ifta] SELFTEST FAIL: dropped IftaPreparerCard did not fail");
        process.exit(1);
      }
      // Planted original S01 defect: no category nav at all.
      fs.writeFileSync(path.join(tmpRoot, BOARD), boardBackup.replace('aria-label="Report categories"', ""), "utf8");
      if (!run(tmpRoot).some((failure) => failure.includes("category hover nav"))) {
        console.error("[verify-rpt-s01-s05-reports-home-ifta] SELFTEST FAIL: missing category nav did not fail");
        process.exit(1);
      }
      console.log(`[verify-rpt-s01-s05-reports-home-ifta] SELFTEST PASS (${planted.length} section failures + QBO-copy mutation detected)`);
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
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
