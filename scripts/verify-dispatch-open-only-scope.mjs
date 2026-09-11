#!/usr/bin/env node
// DISPATCH OPEN-ONLY SCOPE (owner order, 2026-09-11, "STRIP CLOSED LOADS EVERYWHERE, NO EXCEPTIONS").
//
// Dispatch and every tab living inside it (Kanban, List, Round Trips Timeline) must render ONLY
// current/open loads -- nothing closed/settled/billing-tail. The 2026-09-09 "keep delivered/pending-
// docs/invoiced/paid loads on the live board" exception is superseded: it was a narrow, rare carve-out
// for one factoring arrangement, not a general rule. This guard asserts the STATUS VALUES a query can
// return, not just that a filter/constant exists -- the presence-only pattern is exactly what let a
// broad exception ship silently and go unverified for 5+ days.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const MDATA_LOADS_ROUTE = path.join(repoRoot, "apps/backend/src/mdata/loads.routes.ts");
const ROUND_TRIPS_LEGS = path.join(repoRoot, "apps/frontend/src/pages/dispatch/roundTripsLegs.ts");

const POST_DELIVERY_STATUSES = ["delivered", "delivered_pending_docs", "completed_docs_received", "invoiced", "paid"];

/** Pure: does the backend's DISPATCH_LIVE_EXCLUDED_STATUSES set (the board_scope=live exclusion)
 *  actually include every post-delivery/billing-tail status, not just the always-closed cohort? */
export function auditDispatchLiveExclusionSource(src) {
  const failures = [];
  const constMatch = src.match(/DISPATCH_LIVE_EXCLUDED_STATUSES\s*=\s*\[([\s\S]*?)\]\s*as const/);
  if (!constMatch) {
    failures.push("DISPATCH_LIVE_EXCLUDED_STATUSES constant not found -- the live-board exclusion set may have been renamed or reverted to the always-closed-only cohort");
    return failures;
  }
  const body = constMatch[1];
  for (const status of POST_DELIVERY_STATUSES) {
    if (!new RegExp(`["']${status}["']`).test(body)) {
      failures.push(`DISPATCH_LIVE_EXCLUDED_STATUSES is missing "${status}" -- this status would still render on the live Dispatch board`);
    }
  }
  // The live-scope branch must actually USE this constant, not the narrower CLOSED_LOAD_STATUSES alone.
  const liveBranch = src.match(/board_scope\s*===\s*["']live["'][\s\S]{0,300}/);
  if (!liveBranch || !/DISPATCH_LIVE_EXCLUDED_STATUSES/.test(liveBranch[0])) {
    failures.push("the board_scope==='live' branch does not reference DISPATCH_LIVE_EXCLUDED_STATUSES -- it may still be scoped to the narrower always-closed cohort");
  }
  return failures;
}

/** Pure: does RT_TIMELINE_STATUSES still include any post-delivery/billing-tail status? */
export function auditTimelineStatusesSource(src) {
  const failures = [];
  const constMatch = src.match(/RT_TIMELINE_STATUSES\s*=\s*\[([\s\S]*?)\]\s*as const/);
  if (!constMatch) {
    failures.push("RT_TIMELINE_STATUSES constant not found");
    return failures;
  }
  const body = constMatch[1];
  for (const status of POST_DELIVERY_STATUSES) {
    if (new RegExp(`["']${status}["']`).test(body)) {
      failures.push(`RT_TIMELINE_STATUSES still includes "${status}" -- a delivered/billing-tail leg would still paint on the Round Trips Timeline`);
    }
  }
  return failures;
}

function selftest() {
  const assert = { ok: (c, m) => { if (!c) throw new Error(m); } };

  const badRoute = `const DISPATCH_LIVE_EXCLUDED_STATUSES = [\n  ...CLOSED_LOAD_STATUSES,\n] as const;\nif (board_scope === "live") {\n  values.push(DISPATCH_LIVE_EXCLUDED_STATUSES);\n}`;
  assert.ok(auditDispatchLiveExclusionSource(badRoute).length >= 1, "an exclusion set missing the post-delivery cohort must be caught");

  const goodRoute = `const DISPATCH_LIVE_EXCLUDED_STATUSES = [\n  ...CLOSED_LOAD_STATUSES,\n  "delivered",\n  "delivered_pending_docs",\n  "completed_docs_received",\n  "invoiced",\n  "paid",\n] as const;\nif (board_scope === "live") {\n  values.push(DISPATCH_LIVE_EXCLUDED_STATUSES);\n}`;
  assert.ok(auditDispatchLiveExclusionSource(goodRoute).length === 0, "the fixed shape must pass: " + JSON.stringify(auditDispatchLiveExclusionSource(goodRoute)));

  const staleUse = `const DISPATCH_LIVE_EXCLUDED_STATUSES = [\n  ...CLOSED_LOAD_STATUSES,\n  "delivered", "delivered_pending_docs", "completed_docs_received", "invoiced", "paid",\n] as const;\nif (board_scope === "live") {\n  values.push(CLOSED_LOAD_STATUSES);\n}`;
  assert.ok(auditDispatchLiveExclusionSource(staleUse).length >= 1, "a live branch still using the narrower constant must be caught");

  const badTimeline = `export const RT_TIMELINE_STATUSES = [\n  "booked",\n  ...RT_PAIRING_ACTIVE_STATUSES,\n  "delivered_pending_docs",\n] as const;`;
  assert.ok(auditTimelineStatusesSource(badTimeline).length >= 1, "a post-delivery status on the Timeline must be caught");

  const goodTimeline = `export const RT_TIMELINE_STATUSES = [\n  "booked",\n  "planned",\n  "unassigned",\n  ...RT_PAIRING_ACTIVE_STATUSES,\n] as const;`;
  assert.ok(auditTimelineStatusesSource(goodTimeline).length === 0, "the fixed Timeline shape must pass: " + JSON.stringify(auditTimelineStatusesSource(goodTimeline)));

  console.log("verify-dispatch-open-only-scope --selftest PASS");
}

function run() {
  const failures = [];
  const readOrFail = (p) => {
    if (!fs.existsSync(p)) { failures.push(`${path.relative(repoRoot, p)}: missing`); return ""; }
    return fs.readFileSync(p, "utf8");
  };

  const routeSrc = readOrFail(MDATA_LOADS_ROUTE);
  if (routeSrc) failures.push(...auditDispatchLiveExclusionSource(routeSrc).map((f) => `mdata/loads.routes.ts: ${f}`));

  const timelineSrc = readOrFail(ROUND_TRIPS_LEGS);
  if (timelineSrc) failures.push(...auditTimelineStatusesSource(timelineSrc).map((f) => `roundTripsLegs.ts: ${f}`));

  if (failures.length) {
    console.error("verify-dispatch-open-only-scope FAILED:");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(
    "verify-dispatch-open-only-scope: OK -- the Dispatch live board and Round Trips Timeline both " +
      "exclude every post-delivery/billing-tail status, not just the always-closed cohort"
  );
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
