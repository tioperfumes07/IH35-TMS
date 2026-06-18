#!/usr/bin/env node
// Guard: the live dispatch board (DispatchBoard.tsx — what Dispatch.tsx actually mounts) must render the
// locked Samsara 6-clock HOS set on its List/Table grid. #1134 added these to DispatchList.tsx, but that
// component is NOT mounted — the live grid is DispatchBoard's `boardColumns`. This guard prevents the board
// from silently shipping without the 6 columns again (it already lost them once). Additive: the existing
// "Hrs available"/"Hrs to reset" pair may stay.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fail = (m) => { console.error(`FAIL verify-dispatch-board-hos-columns: ${m}`); process.exit(1); };
const read = (p) => readFileSync(join(root, p), "utf8");

// 1) The 6 locked HOS columns + labels stay defined (single source of truth).
const hos = read("apps/frontend/src/components/dispatch/hos/hosClocks.ts");
for (const [key, label] of [
  ["drive", "Drive"], ["shift", "Shift"], ["break", "Break"],
  ["cycle", "Cycle"], ["stopBy", "Stop By"], ["resumeAt", "Resume At"],
]) {
  if (!new RegExp(`key: "${key}", label: "${label}"`).test(hos)) {
    fail(`HOS_COLUMNS must keep locked column { key: "${key}", label: "${label}" }`);
  }
}
// Most-constraining-limit + projected derivation must remain.
if (!/Math\.min\(drive, shift, cycle\)/.test(hos)) fail("computeHosClocks must apply the most-constraining-limit rule");

// 2) The LIVE board mounts the 6 via its shared column model.
const board = read("apps/frontend/src/pages/dispatch/DispatchBoard.tsx");
if (!/import \{ DriverHosClockValue \}/.test(board)) fail("DispatchBoard must import DriverHosClockValue");
if (!/import \{ HOS_COLUMNS \}/.test(board)) fail("DispatchBoard must import HOS_COLUMNS");
if (!/\.\.\.HOS_COLUMNS\.map\(/.test(board)) fail("DispatchBoard.boardColumns must spread the 6 HOS_COLUMNS");
if (!/<DriverHosClockValue\b/.test(board)) fail("DispatchBoard must render <DriverHosClockValue> for the HOS cells");
if (!/colKey=\{hosCol\.key\}/.test(board)) fail("each HOS board column must bind colKey to the HOS_COLUMNS entry");
// boardColumns must drive the List grid (not just Table).
if (!/const listColumns = boardColumns/.test(board)) fail("listColumns must be boardColumns (the 6 cols must show on the List view)");

console.log("PASS verify-dispatch-board-hos-columns");
