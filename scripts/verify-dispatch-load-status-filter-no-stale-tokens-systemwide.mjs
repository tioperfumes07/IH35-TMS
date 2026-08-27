#!/usr/bin/env node
// DISPATCH-LOAD-STATUS-FILTER-ENUM-MISMATCH-400 — SYSTEM-WIDE guard (GO-0758)
//
// #16653 fixed the endpoint side (GET /api/v1/dispatch/loads now normalizes any wide mdata status value
// via normalizeDispatchStatusFilterValue() before validation). This guard closes the OTHER half GO-0758
// asked for: prove NO frontend caller of listDispatchLoads() — the only function that sends a `status`
// filter to that endpoint — ever hard-codes one of the 10 stale wide-vocabulary tokens
// (delivered/draft/planned/at_pickup/paid/booked/closed/at_delivery/assigned/invoiced) as a literal in
// its `status:` array. The backend now tolerates these values (defense-in-depth), but the frontend should
// never intentionally SEND them — every caller should already be using the narrow DispatchStatus
// vocabulary, matching the type the TypeScript compiler already enforces (DispatchLoadListQuery.status:
// DispatchStatus[]). This is a repo-wide scan (not a fixed file list), so it automatically covers any
// NEW caller added later, not just the 4 known today (LoadsSection.tsx, Drivers.tsx,
// DispatchOverview.tsx x2).

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const SCAN_DIR = "apps/frontend/src";

// The 10 stale wide-vocabulary tokens that do NOT exist in dispatchStatusSchema (the narrow "Dispatch
// v2" enum GET /api/v1/dispatch/loads validates against) — see WIDE_LOAD_STATUS_VALUES minus the 9 that
// happen to share a spelling with the narrow enum (unassigned/assigned_not_dispatched/dispatched/
// in_transit/delivered_pending_docs/completed_docs_received/cancelled/abandoned/driver_walkoff/
// driver_no_show are all narrow-valid already and never need flagging here).
const STALE_TOKENS = [
  "draft", "booked", "planned", "assigned", "at_pickup", "at_delivery",
  "delivered", "invoiced", "paid", "closed",
];

function listFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      out.push(...listFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

export function check(files) {
  const failures = [];
  for (const [rel, text] of files) {
    let idx = text.indexOf("listDispatchLoads(");
    while (idx !== -1) {
      // The call's argument object rarely exceeds a few hundred chars; look at a generous window.
      const window = text.slice(idx, idx + 600);
      const closeIdx = window.indexOf(");");
      const callBlock = closeIdx === -1 ? window : window.slice(0, closeIdx);
      const statusMatch = callBlock.match(/status:\s*\[([^\]]*)\]/);
      if (statusMatch) {
        const tokens = [...statusMatch[1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
        for (const t of tokens) {
          if (STALE_TOKENS.includes(t)) {
            failures.push(`${rel}: listDispatchLoads() call sends stale wide-vocabulary status "${t}" — not in dispatchStatusSchema`);
          }
        }
      }
      idx = text.indexOf("listDispatchLoads(", idx + 1);
    }
  }
  return failures;
}

function run() {
  const files = listFiles(path.join(root, SCAN_DIR)).map((f) => [path.relative(root, f), fs.readFileSync(f, "utf8")]);
  const failures = check(files);
  if (failures.length > 0) {
    console.error("FAIL: dispatch-load-status-filter-no-stale-tokens-systemwide");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`PASS: scanned every listDispatchLoads() call site in ${SCAN_DIR} — no stale wide-vocabulary status tokens found`);
}

function selftest() {
  const files = listFiles(path.join(root, SCAN_DIR)).map((f) => [path.relative(root, f), fs.readFileSync(f, "utf8")]);
  const [targetRel, targetText] = files.find(([, text]) => text.includes('status: ["dispatched", "in_transit"],'));
  if (!targetText) {
    console.error("FAIL(selftest): could not find the known-good DispatchOverview.tsx call site — pattern out of sync");
    process.exit(1);
  }
  const offenderText = targetText.replace(
    'status: ["dispatched", "in_transit"],',
    'status: ["dispatched", "in_transit", "delivered"],'
  );
  const offenderFiles = files.map(([rel, text]) => (rel === targetRel ? [rel, offenderText] : [rel, text]));
  const failures = check(offenderFiles);
  if (failures.length === 0) {
    console.error("FAIL(selftest): planted offender (stale 'delivered' token added to a real listDispatchLoads call) was NOT caught");
    process.exit(1);
  }
  console.log("PASS(selftest): planted stale-token regression correctly caught; baseline clean");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
