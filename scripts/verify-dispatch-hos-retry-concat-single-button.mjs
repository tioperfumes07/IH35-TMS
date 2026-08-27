#!/usr/bin/env node
// HOS-RETRY-CONCAT (DISPATCH-DRIVER-LABEL-LOST sibling) — guard
//
// DispatchBoard.tsx and DispatchList.tsx each mount one <DriverHosClockValue> PER HOS_COLUMNS entry (6
// per row, all sharing one react-query cache key) — when the HOS fetch errors, all 6 errored together and
// each independently rendered its own <HosRetryButton/> with no separator, producing
// "RetryRetryRetryRetryRetryRetry" on any row whose driver's HOS status 404s. Live-reproduced on
// /dispatch?view=list this session (driver "Juan USMCA-Battery", 4 loads including L-20260806-0008) —
// live-verified live SHA 15857b1, AFTER the driver-label resolver landed (#16672), meaning the label fix
// surfaced this pre-existing sibling bug clearly for the first time. Fix: DriverHosClockValue takes a
// `showRetryOnError` prop (default false); only the FIRST of the 6 column call sites passes true.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const COMPONENT_FILE = "apps/frontend/src/components/dispatch/hos/DriverHosClocks.tsx";
const BOARD_FILE = "apps/frontend/src/pages/dispatch/DispatchBoard.tsx";
const LIST_FILE = "apps/frontend/src/components/dispatch/DispatchList.tsx";

export function check(componentText, boardText, listText) {
  const failures = [];

  if (!/showRetryOnError = false/.test(componentText)) {
    failures.push(`${COMPONENT_FILE} DriverHosClockValue no longer defaults showRetryOnError to false`);
  }
  if (!/showRetryOnError \? <HosRetryButton onRetry={\(\) => void q\.refetch\(\)} \/> : <span className="text-gray-300">—<\/span>/.test(componentText)) {
    failures.push(`${COMPONENT_FILE} DriverHosClockValue's error branch no longer gates the retry button on showRetryOnError`);
  }

  if (!/showRetryOnError=\{hosColIndex === 0\}/.test(boardText)) {
    failures.push(`${BOARD_FILE} no longer passes showRetryOnError only on the first HOS column — every column will render its own Retry button again`);
  }
  if (!/HOS_COLUMNS\.map\(\(hosCol, hosColIndex\)/.test(boardText)) {
    failures.push(`${BOARD_FILE} HOS_COLUMNS.map no longer tracks the column index needed for showRetryOnError`);
  }

  if (!/showRetryOnError=\{cIndex === 0\}/.test(listText)) {
    failures.push(`${LIST_FILE} no longer passes showRetryOnError only on the first HOS column — every column will render its own Retry button again`);
  }
  if (!/HOS_COLUMNS\.map\(\(c, cIndex\)/.test(listText)) {
    failures.push(`${LIST_FILE} HOS_COLUMNS.map no longer tracks the column index needed for showRetryOnError`);
  }

  return failures;
}

function run() {
  const componentText = fs.readFileSync(path.join(root, COMPONENT_FILE), "utf8");
  const boardText = fs.readFileSync(path.join(root, BOARD_FILE), "utf8");
  const listText = fs.readFileSync(path.join(root, LIST_FILE), "utf8");
  const failures = check(componentText, boardText, listText);
  if (failures.length > 0) {
    console.error("FAIL: dispatch-hos-retry-concat-single-button");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("PASS: exactly one HOS Retry button per row across DispatchBoard/DispatchList (no RetryRetryRetry concat)");
}

function selftest() {
  const componentText = fs.readFileSync(path.join(root, COMPONENT_FILE), "utf8");
  const boardText = fs.readFileSync(path.join(root, BOARD_FILE), "utf8");
  const listText = fs.readFileSync(path.join(root, LIST_FILE), "utf8");

  const offenderComponent = componentText.replace(
    'return showRetryOnError ? <HosRetryButton onRetry={() => void q.refetch()} /> : <span className="text-gray-300">—</span>;',
    "return <HosRetryButton onRetry={() => void q.refetch()} />;"
  );
  if (offenderComponent === componentText) {
    console.error("FAIL(selftest): offender mutation A did not change the component file — pattern out of sync");
    process.exit(1);
  }
  const failuresA = check(offenderComponent, boardText, listText);
  if (failuresA.length === 0) {
    console.error("FAIL(selftest): planted offender (component always shows retry) was NOT caught");
    process.exit(1);
  }

  const offenderBoard = boardText.replace("showRetryOnError={hosColIndex === 0}", "showRetryOnError={true}");
  if (offenderBoard === boardText) {
    console.error("FAIL(selftest): offender mutation B did not change DispatchBoard.tsx — pattern out of sync");
    process.exit(1);
  }
  const failuresB = check(componentText, offenderBoard, listText);
  if (failuresB.length === 0) {
    console.error("FAIL(selftest): planted offender (DispatchBoard always shows retry) was NOT caught");
    process.exit(1);
  }

  console.log("PASS(selftest): 2/2 planted regressions correctly caught; baseline clean");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
