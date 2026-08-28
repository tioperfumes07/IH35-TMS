#!/usr/bin/env node
// DISPATCH-UI-REFINE-2 ITEM 5 guard: the dispatch List shows the 6 Samsara-standard HOS columns
// (drive/shift/break/cycle/stopBy/resumeAt) bound to the locked Samsara field names, with the
// most-constraining-limit rule applied and Stop By/Resume At labeled PROJECTED. Wired to the in-app
// HOS store (#1109) — no Samsara call from the board.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const selftest = process.argv.includes("--selftest");
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fail = (m) => { console.error(`FAIL verify-dispatch-list-hos-columns: ${m}`); process.exit(1); };
const clocks = readFileSync(join(root, "apps/frontend/src/components/dispatch/hos/hosClocks.ts"), "utf8");
const list = readFileSync(join(root, "apps/frontend/src/components/dispatch/DispatchList.tsx"), "utf8");
const pill = readFileSync(join(root, "apps/frontend/src/pages/dispatch/DriverHosPill.tsx"), "utf8");

// 6 column keys.
for (const k of ["drive", "shift", "break", "cycle", "stopBy", "resumeAt"]) {
  if (!new RegExp(`key:\\s*"${k}"`).test(clocks)) fail(`HOS column key "${k}" missing from HOS_COLUMNS`);
}
// Bound to the locked Samsara field names.
const samsara = [
  "clocks.drive.driveRemainingDurationMs",
  "clocks.shift.shiftRemainingDurationMs",
  "clocks.break.timeUntilBreakDurationMs",
  "clocks.cycle.cycleRemainingDurationMs",
];
for (const f of samsara) if (!clocks.includes(f)) fail(`Samsara field binding "${f}" missing`);
// Most-constraining-limit rule.
if (!/Math\.min\(\s*drive\s*,\s*shift\s*,\s*cycle\s*\)/.test(clocks)) fail("most-constraining-limit (min of drive/shift/cycle) not applied");
// Stop By / Resume At labeled projected.
if (!/HOS_PROJECTED_TOOLTIP/.test(clocks) || !/[Pp]rojected/.test(clocks)) fail("Stop By/Resume At must be labeled PROJECTED");
if (!/derived:\s*true/.test(clocks)) fail("stopBy/resumeAt must be marked derived");
// Wired in the List: header + body cells from the in-app store.
// DispatchList uses ParityTable column renders (DriverHosClockValue × HOS_COLUMNS); the older
// raw-<td> DriverHosClockCells path remains for non-ParityTable consumers.
if (!/HOS_COLUMNS\.map/.test(list)) fail("List header must render HOS_COLUMNS");
if (!/<DriverHosClockCells\b/.test(list) && !/<DriverHosClockValue\b/.test(list)) {
  fail("List body must render DriverHosClockCells or DriverHosClockValue");
}
const cells = readFileSync(join(root, "apps/frontend/src/components/dispatch/hos/DriverHosClocks.tsx"), "utf8");
if (!/getDriverHosStatus/.test(cells)) fail("HOS cells must read the in-app HOS store (getDriverHosStatus, #1109)");
function checkRecovery(source) {
  const requirements = [
    ["shared retry control", /function HosRetryButton[\s\S]*?data-hos-retry[\s\S]*?onRetry\(\)/],
    ["status dot query error", /function DriverHosStatusDot[\s\S]*?if \(q\.isError\) return <HosRetryButton compact onRetry=\{\(\) => void q\.refetch\(\)\}/],
    ["clock value query error", /function DriverHosClockValue[\s\S]*?if \(q\.isError\) \{[\s\S]*?showRetryOnError \? <HosRetryButton onRetry=\{\(\) => void q\.refetch\(\)\} \/> : <span[\s\S]*?>—<\/span>[\s\S]*?\}/],
    ["legacy clock cells query error", /function DriverHosClockCells[\s\S]*?if \(q\.isError\)[\s\S]*?<HosRetryButton onRetry=\{\(\) => void q\.refetch\(\)\}/],
  ];
  return requirements.filter(([, pattern]) => !pattern.test(source)).map(([message]) => message);
}
const missing = checkRecovery(cells);
if (missing.length) fail(`HOS read failures must stay visible and retryable across every shared consumer: ${missing.join(", ")}`);
if (!/showRetryOnError=\{cIndex === 0\}/.test(list)) fail("DispatchList must render exactly one HOS retry control per failed row");
const board = readFileSync(join(root, "apps/frontend/src/pages/dispatch/DispatchBoard.tsx"), "utf8");
if (!/showRetryOnError=\{hosColIndex === 0\}/.test(board)) fail("DispatchBoard must render exactly one HOS retry control per failed row");
const pillRecovery = (source) => /if \(hosQuery\.isError\)[\s\S]*?data-hos-pill-retry[\s\S]*?event\.stopPropagation\(\)[\s\S]*?hosQuery\.refetch\(\)/.test(source);
if (!pillRecovery(pill)) {
  fail("DriverHosPill must expose a row-safe retry when its HOS read fails");
}

if (selftest) {
  const mutations = [
    cells.replace("data-hos-retry", "data-hos-hidden"),
    cells.replace("if (q.isError) return <HosRetryButton compact", "if (false) return <HosRetryButton compact"),
    cells.replace("showRetryOnError ? <HosRetryButton onRetry", "false ? <HosRetryButton onRetry"),
    cells.replace(
      "if (q.isError) {\n    return (\n      <>\n        {HOS_COLUMNS.map",
      "if (false) {\n    return (\n      <>\n        {HOS_COLUMNS.map"
    ),
  ];
  for (let index = 0; index < mutations.length; index += 1) {
    if (checkRecovery(mutations[index]).length === 0) fail(`mutation ${index + 1} survived`);
  }
  if (/showRetryOnError=\{cIndex === 0\}/.test(list.replace("cIndex === 0", "false"))) fail("list retry placement mutation survived");
  if (/showRetryOnError=\{hosColIndex === 0\}/.test(board.replace("hosColIndex === 0", "false"))) fail("board retry placement mutation survived");
  const pillMutations = [
    pill.replace("if (hosQuery.isError)", "if (false)"),
    pill.replace("data-hos-pill-retry", "data-hos-pill-hidden"),
    pill.replace("event.stopPropagation();", "void event;"),
  ];
  for (let index = 0; index < pillMutations.length; index += 1) {
    if (pillRecovery(pillMutations[index])) fail(`pill mutation ${index + 1} survived`);
  }
  const total = mutations.length + pillMutations.length + 2;
  console.log(`PASS verify-dispatch-list-hos-columns selftest ${total}/${total}`);
} else {
  console.log("PASS verify-dispatch-list-hos-columns");
}
