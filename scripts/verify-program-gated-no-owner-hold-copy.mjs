#!/usr/bin/env node
/**
 * verify-program-gated-no-owner-hold-copy.mjs
 * LV-PROGRAM-TRACKER-GATED-OWNER-HOLD-COPY
 *
 * PENDING (GATED) may remain as a historical status token, but generators and
 * Program Board must never tell operators to wait for Jorge's gate / owner approval.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-program-gated-no-owner-hold-copy";

const FILES = {
  xlsx: "scripts/export-tracker-xlsx.mjs",
  reconcile: "scripts/reconcile-block-status.mjs",
  board: "apps/frontend/src/pages/program/ProgramBoardPage.tsx",
  tracker: "apps/frontend/src/pages/program/ProgramTrackerPage.tsx",
};

const FORBIDDEN = [
  /needs Jorge'?s? gate/i,
  /needs Jorge gate/i,
  /Jorge'?s? gate first/i,
];

function read(rel) {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

function analyze(srcs) {
  const failures = [];
  for (const [name, src] of Object.entries(srcs)) {
    for (const re of FORBIDDEN) {
      if (re.test(src)) failures.push(`${name}: forbidden owner-hold wording (${re})`);
    }
  }
  if (!/no owner approval required/i.test(srcs.xlsx) && !/actionable Pending \(no owner approval/i.test(srcs.xlsx)) {
    failures.push("xlsx: PENDING (GATED) group must disclose no owner approval / actionable Pending");
  }
  if (!/no owner approval required/i.test(srcs.reconcile)) {
    failures.push("reconcile: PENDING (GATED) legend must disclose no owner approval required");
  }
  if (!/legacy GATED \(actionable\)/.test(srcs.board)) {
    failures.push("ProgramBoardPage pending chip must label legacy GATED as actionable");
  }
  if (!/Historical GATED tag; no owner approval required/.test(srcs.tracker)) {
    failures.push("ProgramTrackerPage must keep historical GATED non-blocking tooltip");
  }
  if (!/no owner approval is required/.test(srcs.tracker)) {
    failures.push("ProgramTrackerPage must disclose no owner approval is required");
  }
  return failures;
}

function fail(msg) {
  console.error(`${LABEL} FAIL: ${msg}`);
  process.exit(1);
}

function selftest() {
  const good = {
    xlsx: '["PENDING (GATED)", "▼ PENDING (GATED) — actionable Pending (no owner approval required)"]',
    reconcile: "**PENDING (GATED)** = historical tag; no owner approval required.",
    board: "legacy GATED (actionable)",
    tracker: "Historical GATED tag; no owner approval required\nno owner approval is required",
  };
  const bad = {
    ...good,
    xlsx: "needs Jorge's gate first",
  };
  if (analyze(good).length) fail(`selftest GOOD: ${analyze(good).join("; ")}`);
  if (!analyze(bad).length) fail("selftest expected BAD to fail");
  console.log(`${LABEL} selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const sources = Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, read(f)]));
const failures = analyze(sources);
if (failures.length) fail(failures.join("; "));
console.log(`${LABEL} PASS — GATED is historical, not an owner hold`);
