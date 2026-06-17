#!/usr/bin/env node
// DISPATCH-UI-REFINE-2 ITEM 5 guard: the dispatch List shows the 6 Samsara-standard HOS columns
// (drive/shift/break/cycle/stopBy/resumeAt) bound to the locked Samsara field names, with the
// most-constraining-limit rule applied and Stop By/Resume At labeled PROJECTED. Wired to the in-app
// HOS store (#1109) — no Samsara call from the board.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fail = (m) => { console.error(`FAIL verify-dispatch-list-hos-columns: ${m}`); process.exit(1); };
const clocks = readFileSync(join(root, "apps/frontend/src/components/dispatch/hos/hosClocks.ts"), "utf8");
const list = readFileSync(join(root, "apps/frontend/src/components/dispatch/DispatchList.tsx"), "utf8");

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
if (!/HOS_COLUMNS\.map/.test(list)) fail("List header must render HOS_COLUMNS");
if (!/<DriverHosClockCells\b/.test(list)) fail("List body must render DriverHosClockCells");
const cells = readFileSync(join(root, "apps/frontend/src/components/dispatch/hos/DriverHosClocks.tsx"), "utf8");
if (!/getDriverHosStatus/.test(cells)) fail("HOS cells must read the in-app HOS store (getDriverHosStatus, #1109)");
console.log("PASS verify-dispatch-list-hos-columns");
