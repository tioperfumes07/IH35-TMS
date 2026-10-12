#!/usr/bin/env node
/**
 * DISP-FILTER-01 — mdata loads list status contract matches Neon enum + statuses alias.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(resolve(ROOT, "apps/backend/src/mdata/loads.routes.ts"), "utf8");
const machine = readFileSync(resolve(ROOT, "apps/backend/src/dispatch/load-state-machine.ts"), "utf8");
const required = [
  "delivered_pending_docs",
  "completed_docs_received",
  "assigned_not_dispatched",
  "unassigned",
  "statusFilterSchema",
  "statuses: statusFilterSchema",
  "statusesParam",
];
const TRANSITION_KEYS = ["unassigned", "assigned_not_dispatched", "delivered_pending_docs", "completed_docs_received"];

// LEAD 443.99 class B (2026-10-12).
//   old rule: loads.routes.ts itself contains the transition-table keys `unassigned:` / `assigned_not_dispatched:` /
//             `delivered_pending_docs:` / `completed_docs_received:`.
//   new rule: loads.routes.ts imports MDATA_STATUS_TRANSITIONS from dispatch/load-state-machine and gates on it, and
//             that table (in load-state-machine.ts) carries a row for each of those statuses.
//   why: LST-F3268 (7e7d325b36, 2026-10-02) moved the full-enum table out of the route into the one state machine
//        ("one module, one machine"); the route no longer holds the literal keys. A table missing a row, or a route
//        that stops using the shared table, still fails.
export function contractProblems(routeSrc, machineSrc) {
  const problems = [];
  const missing = required.filter((tok) => !routeSrc.includes(tok));
  if (missing.length) problems.push(`missing: ${missing.join(", ")}`);
  if (!/import \{[^}]*\bMDATA_STATUS_TRANSITIONS\b[^}]*\} from "\.\.\/dispatch\/load-state-machine\.js"/.test(routeSrc) ||
      !/MDATA_STATUS_TRANSITIONS\[current\.status\]/.test(routeSrc)) {
    problems.push("loads.routes.ts must gate transitions on the shared MDATA_STATUS_TRANSITIONS");
  }
  const start = machineSrc.indexOf("export const MDATA_STATUS_TRANSITIONS");
  const table = start === -1 ? "" : machineSrc.slice(start, machineSrc.indexOf("};", start));
  if (!table) problems.push("load-state-machine.ts must export MDATA_STATUS_TRANSITIONS");
  for (const key of TRANSITION_KEYS) {
    if (!new RegExp(`\\n\\s*${key}:\\s*\\[`).test(table)) problems.push(`transitions missing ${key}:`);
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const tStart = machine.indexOf("export const MDATA_STATUS_TRANSITIONS");
  const dropRow = (key) => machine.slice(0, tStart) + machine.slice(tStart).replace(new RegExp(`\\n\\s*${key}:\\s*\\[[^\\]]*\\],`), "\n");
  const plants = [
    ["route stops using the shared table", src.replaceAll("MDATA_STATUS_TRANSITIONS", "LOCAL_TRANSITIONS"), machine],
    ["table drops unassigned", src, dropRow("unassigned")],
    ["table drops completed_docs_received", src, dropRow("completed_docs_received")],
    ["statuses alias removed", src.replaceAll("statusesParam", "statusParamOnly"), machine],
  ];
  const caught = plants.filter(([, r, m]) => contractProblems(r, m).length > 0).length;
  const clean = contractProblems(src, machine);
  console.log(`verify-disp-filter-01-mdata-status-contract SELFTEST: ${caught}/${plants.length} planted violations caught${clean.length ? " — REAL SOURCE FLAGGED: " + clean.join("; ") : ""}`);
  process.exit(caught === plants.length && clean.length === 0 ? 0 : 1);
}

const problems = contractProblems(src, machine);
if (problems.length) {
  console.error("FAIL verify-disp-filter-01-mdata-status-contract —", problems.join("; "));
  process.exit(1);
}
console.log("PASS verify-disp-filter-01-mdata-status-contract");
