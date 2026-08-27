#!/usr/bin/env node
// SCHEDULED-REPORTS-EDIT-REPORT-FIELD-BLANK-UNKNOWN-ID — guard
//
// After SCHEDULED-REPORTS-EDIT-BUTTON-OPENS-BLANK-CREATE-FORM-NOT-EDIT (#16410) fixed Edit to prefill
// Frequency/Time/Day/Subject, CC-2 live-verified a residual gap: the Report field still rendered blank
// ("Select...") for any live schedule using one of 6 preset-driven report_ids
// (dispatch-board/cash-position-ar/profit-per-truck-week/settlements-ready/maintenance-open-wos/
// ifta-quarterly-state) — ScheduledReportsPage.tsx knew their labels, but ScheduleReportModal.tsx's own
// `extraReports` option catalog (used to build the "Report" <select>) never learned about them. The fix
// extracts a single shared SCHEDULED_REPORT_LABELS catalog both files import, so they can't drift apart
// again. This guard fails if either file stops importing the shared catalog, or if the modal's option
// list stops accounting for an unknown reportId.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const CATALOG_FILE = "apps/frontend/src/lib/scheduled-report-catalog.ts";
const PAGE_FILE = "apps/frontend/src/pages/reports/ScheduledReportsPage.tsx";
const MODAL_FILE = "apps/frontend/src/pages/reports/ScheduleReportModal.tsx";

const REQUIRED_IDS = [
  "dispatch-board",
  "cash-position-ar",
  "profit-per-truck-week",
  "settlements-ready",
  "maintenance-open-wos",
  "ifta-quarterly-state",
  "cash-flow-overview",
  "settlement-summary",
  "customer-profitability",
  "profit-per-truck",
  "fuel-reconciliation",
  "maintenance-cost-per-unit",
  "ar-aging",
  "ap-aging",
];

export function check(catalogText, pageText, modalText) {
  const failures = [];

  for (const id of REQUIRED_IDS) {
    if (!catalogText.includes(`"${id}"`)) {
      failures.push(`${CATALOG_FILE} no longer includes report_id "${id}" in the shared catalog`);
    }
  }

  if (!/import \{ SCHEDULED_REPORT_LABELS \} from "\.\.\/\.\.\/lib\/scheduled-report-catalog";/.test(pageText)) {
    failures.push(`${PAGE_FILE} no longer imports SCHEDULED_REPORT_LABELS from the shared catalog`);
  }
  if (!/const REPORT_LABELS = SCHEDULED_REPORT_LABELS;/.test(pageText)) {
    failures.push(`${PAGE_FILE} REPORT_LABELS no longer aliases the shared catalog (drifted back to its own local list?)`);
  }

  if (!/import \{ SCHEDULED_REPORT_LABELS \} from "\.\.\/\.\.\/lib\/scheduled-report-catalog";/.test(modalText)) {
    failures.push(`${MODAL_FILE} no longer imports SCHEDULED_REPORT_LABELS from the shared catalog`);
  }
  if (!/Object\.entries\(SCHEDULED_REPORT_LABELS\)\.map\(\(\[id, name\]\) => \(\{ id, name \}\)\)/.test(modalText)) {
    failures.push(`${MODAL_FILE} extraReports no longer derives from the shared SCHEDULED_REPORT_LABELS catalog`);
  }
  if (!/if \(reportId && !combined\.some\(\(o\) => o\.id === reportId\)\)/.test(modalText)) {
    failures.push(`${MODAL_FILE} no longer synthesizes a fallback option for an unknown reportId (belt-and-suspenders removed)`);
  }

  return failures;
}

function run() {
  const catalogText = fs.readFileSync(path.join(root, CATALOG_FILE), "utf8");
  const pageText = fs.readFileSync(path.join(root, PAGE_FILE), "utf8");
  const modalText = fs.readFileSync(path.join(root, MODAL_FILE), "utf8");
  const failures = check(catalogText, pageText, modalText);
  if (failures.length > 0) {
    console.error("FAIL: scheduled-report-catalog-shared");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("PASS: ScheduledReportsPage.tsx and ScheduleReportModal.tsx share one report_id -> label catalog (no drift), with a fallback for unknown ids");
}

function selftest() {
  const catalogText = fs.readFileSync(path.join(root, CATALOG_FILE), "utf8");
  const pageText = fs.readFileSync(path.join(root, PAGE_FILE), "utf8");
  const modalText = fs.readFileSync(path.join(root, MODAL_FILE), "utf8");

  const offenderModal = modalText.replace(
    "Object.entries(SCHEDULED_REPORT_LABELS).map(([id, name]) => ({ id, name }))",
    '[{ id: "ar-aging", name: "A/R aging" }]',
  );
  if (offenderModal === modalText) {
    console.error("FAIL(selftest): offender mutation did not change the modal source — pattern out of sync");
    process.exit(1);
  }
  const failures = check(catalogText, pageText, offenderModal);
  if (failures.length === 0) {
    console.error("FAIL(selftest): planted offender (modal reverted to a narrow hardcoded list) was NOT caught");
    process.exit(1);
  }
  console.log("PASS(selftest): planted regression correctly caught; baseline clean");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
