#!/usr/bin/env node
// Dispatch HOS guard (feed RESOLVED 2026-06-17 — in-app /safety/hos store, NOT Samsara).
// REALIGNED 2026-06-17: Jorge removed the old summary pair ("Hrs available" / "Hrs to reset") from the
// live board — it overlapped Drive/Shift/Cycle and cluttered the grid. The board now shows only the
// locked Samsara 6-clock set (Drive·Shift·Break·Cycle·Stop By·Resume At), covered by
// verify-dispatch-board-hos-columns. This guard now (1) keeps the in-app HOS store assertion and
// (2) LOCKS THE REMOVAL so the old pair cannot creep back.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const fail = (msg) => {
  console.error(`FAIL verify-dispatch-hos-columns-wired: ${msg}`);
  process.exit(1);
};

// 1. The in-app HOS store still computes the cycle clock + the 8-day roll-off (data source remains real;
//    the 6-column board set reads the same store via getDriverHosStatus).
const service = read("apps/backend/src/telematics/hos-clocks.service.ts");
if (!service.includes("cycle_remaining_min")) fail("HOS service must still expose cycle_remaining_min");
if (!service.includes("cycle_reset_in_min")) fail("HOS service must still expose cycle_reset_in_min");

// 2. The removed summary pair must STAY removed from the live board. Ban CODE patterns (render fns,
//    column key/header definitions) — prose comments referencing the history are fine.
const board = read("apps/frontend/src/pages/dispatch/DispatchBoard.tsx");
const bannedCode = [
  /\brenderHosAvailable\b/, /\brenderHosToReset\b/,
  /key:\s*"hrs_(available|to_reset)"/, /header:\s*"Hrs (available|to reset)"/,
];
for (const re of bannedCode) {
  if (re.test(board)) fail(`the removed summary HOS pair must not return to DispatchBoard (found code: ${re})`);
}

// 3. The board renders the locked 6-clock set instead (single source of truth = HOS_COLUMNS).
if (!board.includes("HOS_COLUMNS.map") || !board.includes("DriverHosClockValue")) {
  fail("DispatchBoard must render the 6 HOS_COLUMNS via DriverHosClockValue");
}

console.log("PASS verify-dispatch-hos-columns-wired");
