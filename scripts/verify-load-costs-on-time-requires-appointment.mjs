#!/usr/bin/env node
/**
 * Spec 09-04-2026-Claude-Coder-1-Load-Costs-Board-19-Columns.md §5.5 / §2.2, exact four branches:
 *   actual_arrival_at IS NULL                      -> 'In transit'
 *   actual_arrival_at <= scheduled_arrival_at       -> 'On Time'
 *   actual_arrival_at >  scheduled_arrival_at       -> 'Late'
 *   scheduled_arrival_at IS NULL and actual NOT NULL -> 'Delivered — no appointment on file'
 * "The last branch is mandatory. Never render 'On Time' when there is no appointment to be on time
 * for -- that is a zero asserting a fact nobody measured."
 */
import fs from "node:fs";

const BOARD = "apps/frontend/src/pages/accounting/LoadCostsBoardPage.tsx";

function violations(board) {
  const errors = [];
  const fnMatch = board.match(/function serviceStatus\([\s\S]*?\n\}/);
  if (!fnMatch) {
    errors.push("serviceStatus() not found -- Status column is not computed as service performance");
    return errors;
  }
  const body = fnMatch[0];
  if (!/if \(!r\.actual_delivery_at\) return \{ label: "In transit"/.test(body)) errors.push("branch 1 (no actual delivery -> 'In transit') missing or reordered");
  if (!/if \(!r\.scheduled_delivery_at\) return \{ label: "Delivered — no appointment on file"/.test(body)) errors.push("branch 4 (delivered with no scheduled appointment -> 'Delivered — no appointment on file') missing -- this is the mandatory branch: never render On Time with no appointment to judge against");
  if (!/"On Time"/.test(body) || !/"Late"/.test(body)) errors.push("On Time / Late branches missing");
  // Order matters: the actual-delivery-null check must run BEFORE the scheduled-null check, else a
  // load with no scheduled appointment AND no actual delivery would wrongly report 'Delivered...'.
  const actualIdx = body.indexOf("!r.actual_delivery_at");
  const scheduledIdx = body.indexOf("!r.scheduled_delivery_at");
  if (actualIdx < 0 || scheduledIdx < 0 || actualIdx > scheduledIdx) errors.push("branch order wrong -- 'no actual delivery yet' must be checked before 'no scheduled appointment'");
  return errors;
}

function check(board) {
  const errors = violations(board);
  if (errors.length) throw new Error(errors.join("; "));
}

const board = fs.readFileSync(BOARD, "utf8");

if (process.argv.includes("--selftest")) {
  let caught = 0;
  const mutations = [
    board.replace('{ label: "In transit"', '{ label: "removed"'),
    board.replace('{ label: "Delivered — no appointment on file"', '{ label: "removed"'),
    board.replaceAll('"On Time"', '"removed"'),
    board.replaceAll('"Late"', '"removed"'),
    board
      .replace('if (!r.actual_delivery_at) return { label: "In transit", style: { backgroundColor: "#F4E7C8", color: "#8A6D1D" } };\n  if (!r.scheduled_delivery_at) return { label: "Delivered — no appointment on file", style: { backgroundColor: "#F3F4F6", color: "#4B5563" } };', '__SWAPPED__'),
  ];
  for (const [index, mutated] of mutations.entries()) {
    try { check(mutated); }
    catch { caught += 1; continue; }
    throw new Error(`mutation ${index + 1} escaped detection`);
  }
  check(board);
  console.log(`PASS verify-load-costs-on-time-requires-appointment --selftest (${caught}/${mutations.length})`);
} else {
  check(board);
  console.log("PASS verify-load-costs-on-time-requires-appointment (four-branch service status, correctly ordered)");
}
