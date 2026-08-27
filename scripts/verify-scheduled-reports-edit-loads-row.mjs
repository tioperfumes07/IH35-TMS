#!/usr/bin/env node
// SCHEDULED-REPORTS-EDIT-BUTTON-OPENS-BLANK-CREATE-FORM-NOT-EDIT — guard
//
// /reports/scheduled-custom's "Edit" button used to be byte-identical to "+ Schedule a new report"
// (both called `setModalOpen(true)` with zero row data passed), so ScheduleReportModal always opened in
// hardcoded create-mode (report_id="ar-aging", every field a default) — editing any row actually created a
// brand-new duplicate schedule instead of updating the clicked one. The fix threads the clicked row's id
// into the modal as `editId`, fetches the real row via GET /api/v1/scheduled-reports/:id, pre-fills every
// field from it, and calls the existing (previously-unused) PATCH `updateScheduledReport` on save instead
// of `createScheduledReport`. This guard fails if any of that wiring is removed.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const PAGE = "apps/frontend/src/pages/reports/ScheduledReportsPage.tsx";
const MODAL = "apps/frontend/src/pages/reports/ScheduleReportModal.tsx";
const API = "apps/frontend/src/api/scheduled-reports.ts";

export function check(pageText, modalText, apiText) {
  const failures = [];

  if (!/setEditingRow\(r\)/.test(pageText)) {
    failures.push(`${PAGE} Edit button no longer calls setEditingRow(r) — row identity not threaded to the modal`);
  }
  if (!/editId=\{editingRow\?\.id\s*\?\?\s*null\}/.test(pageText)) {
    failures.push(`${PAGE} no longer passes editId={editingRow?.id ?? null} to ScheduleReportModal`);
  }
  if (!/setEditingRow\(null\)/.test(pageText)) {
    failures.push(`${PAGE} "+ Schedule a new report" / onClose no longer clears editingRow — a stale edit id would leak into create mode`);
  }

  if (!/getScheduledReport\(editId as string, operatingCompanyId\)/.test(modalText)) {
    failures.push(`${MODAL} no longer fetches the real row via getScheduledReport(editId, ...) when editing`);
  }
  if (!/updateScheduledReport\(editId, buildPayload\(\)\)/.test(modalText)) {
    failures.push(`${MODAL} Save no longer calls updateScheduledReport(editId, ...) in edit mode — would silently create a duplicate instead of updating`);
  }
  if (!/setReportId\(row\.report_id\)/.test(modalText)) {
    failures.push(`${MODAL} prefill effect no longer seeds reportId from the fetched row`);
  }
  if (!/setRecipients\(\(row\.recipients_to \?\? \[\]\)\.join\(", "\)\)/.test(modalText)) {
    failures.push(`${MODAL} prefill effect no longer seeds recipients from row.recipients_to`);
  }

  if (!/export async function getScheduledReport/.test(apiText)) {
    failures.push(`${API} getScheduledReport() helper was removed`);
  }

  return failures;
}

function run() {
  const pageText = fs.readFileSync(path.join(root, PAGE), "utf8");
  const modalText = fs.readFileSync(path.join(root, MODAL), "utf8");
  const apiText = fs.readFileSync(path.join(root, API), "utf8");
  const failures = check(pageText, modalText, apiText);
  if (failures.length > 0) {
    console.error("FAIL: scheduled-reports-edit-loads-row");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("PASS: Scheduled reports 'Edit' loads the clicked row's real data and saves via PATCH, not a blank create form");
}

function selftest() {
  const pageText = fs.readFileSync(path.join(root, PAGE), "utf8");
  const modalText = fs.readFileSync(path.join(root, MODAL), "utf8");
  const apiText = fs.readFileSync(path.join(root, API), "utf8");

  const offenderModal = modalText.replace(
    "await updateScheduledReport(editId, buildPayload());",
    "await createScheduledReport(buildPayload());",
  );
  if (offenderModal === modalText) {
    console.error("FAIL(selftest): offender mutation did not change the modal source — pattern out of sync");
    process.exit(1);
  }
  const failuresA = check(pageText, offenderModal, apiText);
  if (failuresA.length === 0) {
    console.error("FAIL(selftest): planted offender (Save always creates, never updates) was NOT caught");
    process.exit(1);
  }

  const offenderPage = pageText.replace(
    /onClick=\{\(\) => \{\s*setEditingRow\(r\);\s*setModalOpen\(true\);\s*\}\}/,
    "onClick={() => setModalOpen(true)}",
  );
  if (offenderPage === pageText) {
    console.error("FAIL(selftest): offender mutation did not change the page source — pattern out of sync");
    process.exit(1);
  }
  const failuresB = check(offenderPage, modalText, apiText);
  if (failuresB.length === 0) {
    console.error("FAIL(selftest): planted offender (Edit button drops row identity) was NOT caught");
    process.exit(1);
  }

  console.log("PASS(selftest): both planted regressions correctly caught; baseline clean");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
