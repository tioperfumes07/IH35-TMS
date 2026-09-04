#!/usr/bin/env node
/**
 * DISPATCH #19 (owner 2026-09-04): "IF ON ANY COLUMN THERE IS NO DATA, LIKE RISK, STATUS, ON TIME,
 * FRESHNESS, PUT LINE NOT TEXT, IT LOOKS TOO DIRTY." Empty signal cells rendered a WORD pill —
 * On-time → "Unknown", Freshness → "L? stale", Risk → "Unknown" — which reads as a real status.
 * Each must render the empty-cell dash (—) when there is genuinely no signal.
 *
 * Self-testing static guard. Run: node scripts/verify-dispatch-empty-cell-dash.mjs [--selftest]
 */
import fs from "node:fs";

const F_COLS = "apps/frontend/src/components/dispatch/LiveEtaColumns.tsx";
const F_FRESH = "apps/frontend/src/components/dispatch/FreshnessIndicator.tsx";
const F_BOARD = "apps/frontend/src/pages/dispatch/DispatchBoard.tsx";
const files = {
  cols: fs.readFileSync(F_COLS, "utf8"),
  fresh: fs.readFileSync(F_FRESH, "utf8"),
  board: fs.readFileSync(F_BOARD, "utf8"),
};

const contracts = [
  [
    "On-time column renders a dash (not 'Unknown') when prediction is null",
    "cols",
    (s) => /if \(prediction === null\) \{[\s\S]*?>—<\/span>/.test(s),
    (s) => s.replace("if (prediction === null) {", "if (false) {"),
  ],
  [
    "Freshness renders a dash when there is no timestamp AND no tier",
    "fresh",
    (s) => /if \(lastFetchedAt === null && cacheTier === null\) \{[\s\S]*?>—<\/span>/.test(s),
    (s) => s.replace("if (lastFetchedAt === null && cacheTier === null) {", "if (false) {"),
  ],
  [
    "Risk cell renders a dash when the tier falls back to 'Unknown'",
    "board",
    (s) => /if \(label === "Unknown"\) \{\s*return <span className="text-gray-400"[^>]*>—<\/span>;/.test(s),
    (s) => s.replace('if (label === "Unknown") {', "if (false) {"),
  ],
];

function audit(fileset) {
  return contracts.filter(([, key, test]) => !test(fileset[key])).map(([name]) => name);
}

const failures = audit(files);
if (failures.length) {
  console.error(`[verify-dispatch-empty-cell-dash] FAILED\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  let caught = 0;
  for (const [name, key, , mutate] of contracts) {
    const mutated = { ...files, [key]: mutate(files[key]) };
    if (audit(mutated).includes(name)) caught += 1;
    else throw new Error(`selftest failed to catch: ${name}`);
  }
  console.log(`[verify-dispatch-empty-cell-dash] SELFTEST PASS — ${caught}/${contracts.length} mutations detected`);
  process.exit(0);
}

console.log("[verify-dispatch-empty-cell-dash] OK");
