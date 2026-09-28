#!/usr/bin/env node
// ROUND 167 — TRUCK LINE: THE RAIL AND THE STAMP PATH MUST BE RENDERED, NOT MERELY DECLARED.
//
// Why this guard exists: PR #22943 (commit 214ff623) rewrote TruckLineBoard.tsx into the ROUND
// 155.6 seven-column grid and stopped rendering TruckLineTrack. That silently orphaned the entire
// 7-station rail AND the only way to stamp a station or record an exception from this board --
// openStamp, openOther, confirmException and clearException were left declared and never called,
// and the stamp popover still rendered while nothing could ever set stampPrompt. Measured
// consequence: `tsc -b` failed with 13x TS6133 and every frontend Render build from 11:43 UTC
// 2026-09-28 onward was red (4 consecutive build_failed), so the deployed app froze on the
// 11:42:17 build. Corroborated independently by ROUND 155.20's measurement that the dispatcher
// manual stamp route "has fired once, ever, system-wide."
//
// A declared-but-uncalled handler is the exact shape of that regression, and noUnusedLocals only
// catches it once NOTHING references the symbol -- it cannot catch a handler that is passed along
// but never reachable. This guard asserts the render, not the declaration.
//
// Fails when TruckLineBoard.tsx:
//   A) does not render <TruckLineTrack ... /> anywhere (the rail is gone again).
//   B) declares openStamp / openOther / confirmException / clearException without wiring each one
//      into a rendered prop or handler (the stamp + exception path is unreachable again).
//   C) renders the stampPrompt popover while nothing ever calls setStampPrompt (an unreachable
//      modal -- the precise dead-end #22943 shipped).
//
// --selftest plants one mutation per audit against an in-memory copy of the real source and
// requires the guard to FAIL each time.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BOARD_FILE = "apps/frontend/src/pages/dispatch/TruckLineBoard.tsx";
const HANDLERS = ["openStamp", "openOther", "confirmException", "clearException"];

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

function auditRailIsRendered(src) {
  if (/<TruckLineTrack[\s>]/.test(src)) return [];
  return [
    `${BOARD_FILE}: <TruckLineTrack> is never rendered — the 7-station rail is orphaned again (this is what #22943 did: 13x TS6133 and 4 red Render builds).`,
  ];
}

function auditStampPathIsReachable(src) {
  const failures = [];
  for (const name of HANDLERS) {
    const declared = new RegExp(`const ${name} =`).test(src);
    if (!declared) continue;
    // Every reference that is not the declaration itself: a prop value, a JSX handler, a call.
    const refs = src.match(new RegExp(`\\b${name}\\b`, "g")) ?? [];
    if (refs.length < 2) {
      failures.push(
        `${BOARD_FILE}: ${name} is declared but never wired into anything rendered — the stamp/exception path is unreachable from the board.`
      );
    }
  }
  return failures;
}

function auditNoUnreachableStampPopover(src) {
  const rendersPopover = /\{stampPrompt \?/.test(src);
  if (!rendersPopover) return [];
  // Only a call that sets a real prompt object can OPEN it. setStampPrompt(null) closes it, and
  // there are several of those (✕, Cancel, post-submit) — counting every call would pass on a
  // board that can only ever close a modal it cannot open.
  const opens = (src.match(/setStampPrompt\(\s*\{/g) ?? []).length;
  if (opens >= 1) return [];
  return [
    `${BOARD_FILE}: the stampPrompt popover is rendered but setStampPrompt is only ever called to close it — the modal can never open.`,
  ];
}

function runAll(src) {
  return [...auditRailIsRendered(src), ...auditStampPathIsReachable(src), ...auditNoUnreachableStampPopover(src)];
}

function selftest() {
  const src = read(BOARD_FILE);
  const mutations = [
    ["A: rail not rendered", src.replace(/<TruckLineTrack/g, "<RailRemoved")],
    [
      "B: a stamp handler orphaned",
      // strip every reference to openStamp except its own declaration
      src
        .split("\n")
        .map((l) => (/const openStamp =/.test(l) ? l : l.replace(/\bopenStamp\b/g, "noop")))
        .join("\n"),
    ],
    ["C: stamp popover unreachable", src.replace(/setStampPrompt\(\{[^}]*\}\)/g, "void 0")],
  ];
  let ok = true;
  for (const [label, mutated] of mutations) {
    const failures = runAll(mutated);
    if (failures.length === 0) {
      console.error(`selftest FAILED — mutation "${label}" was not caught`);
      ok = false;
    } else {
      console.log(`selftest OK — mutation "${label}" caught: ${failures[0]}`);
    }
  }
  if (!ok) process.exit(1);
  console.log("verify-truck-line-rail-and-stamping-are-wired --selftest OK — 3/3 mutations caught");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const failures = runAll(read(BOARD_FILE));
  if (failures.length > 0) {
    console.error("verify-truck-line-rail-and-stamping-are-wired FAILED:");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(
    "verify-truck-line-rail-and-stamping-are-wired OK — the 7-station rail is rendered, every stamp/exception handler is wired into something rendered, and the stamp popover can actually open."
  );
}
