#!/usr/bin/env node
// PROGRAM-SCENARIO-TRACKER-POLL-FOOTER-STALE-CADENCE-TEXT — guard
//
// ScenarioTrackerHome.tsx's actual polling cadence (POLL_MS, fed to react-query's refetchInterval) was
// changed from a 20s hand-rolled setTimeout to a 3s TanStack Query poll (per the file's own "WIRE-LIVE
// Layer 1" comment) — but the user-facing footer text ("poll every 20s · CT") was never updated,
// live-verified this session by measuring 6 real network requests to /api/v1/home/scenario-tracker in an
// 8-second window (~3s cadence), directly contradicting the displayed "20s" claim. Fix: the footer now
// interpolates POLL_MS directly instead of a hardcoded number, so it can never drift from the real value
// again. This guard fails if the footer reverts to a literal hardcoded seconds value.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const FILE = "apps/frontend/src/pages/program/scenario-tracker/ScenarioTrackerHome.tsx";

export function check(text) {
  const failures = [];
  if (!/poll every \{POLL_MS \/ 1000\}s/.test(text)) {
    failures.push(`${FILE} footer no longer derives its cadence text from POLL_MS — it can drift out of sync again`);
  }
  // A literal "poll every <digits>s" (not the interpolated form) means someone hardcoded a number again.
  if (/poll every \d+s/.test(text)) {
    failures.push(`${FILE} footer has a hardcoded "poll every Ns" literal instead of deriving from POLL_MS`);
  }
  return failures;
}

function run() {
  const text = fs.readFileSync(path.join(root, FILE), "utf8");
  const failures = check(text);
  if (failures.length > 0) {
    console.error("FAIL: program-scenario-tracker-poll-footer-matches-cadence");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("PASS: scenario tracker footer's advertised poll cadence derives from the real POLL_MS constant");
}

function selftest() {
  const text = fs.readFileSync(path.join(root, FILE), "utf8");
  const offender = text.replace("poll every {POLL_MS / 1000}s", "poll every 20s");
  if (offender === text) {
    console.error("FAIL(selftest): offender mutation did not change the file — pattern out of sync");
    process.exit(1);
  }
  const failures = check(offender);
  if (failures.length === 0) {
    console.error("FAIL(selftest): planted offender (hardcoded stale '20s' literal) was NOT caught");
    process.exit(1);
  }
  console.log("PASS(selftest): planted regression correctly caught; baseline clean");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
