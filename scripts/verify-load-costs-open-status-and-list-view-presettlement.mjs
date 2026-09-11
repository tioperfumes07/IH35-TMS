#!/usr/bin/env node
// LOAD COSTS STATUS FILTER + LIST VIEW PRE-SETTLEMENT-ONLY (owner order, 2026-09-11).
//
// PART 1: apps/backend/src/accounting/load-costs-board.routes.ts's `is_resettlement` CTE used to
// include a blunt `ds.trip_closed_at IS NOT NULL OR ds.status IN ('closed','approved','paid')`
// branch (added by PR #21692, ACCT-F6350/REG-040) that fired for ANY load whose settlement had
// closed -- even a load still genuinely open (status='delivered_pending_docs', docs/costs not yet
// tracked) whose settlement auto-closed the moment it delivered (the load_bookended model's own
// design: delivery IS the trigger for settlement close, not something that happens after it).
// Live-confirmed this hid 5 of 8 real USMCA delivered_pending_docs loads from every open Costs tab
// (13517/13531/13533/13539/13584), though none of them -- nor their tour's first load, nor any
// invoice -- was ever actually finalized. This guard asserts that blunt branch never returns.
//
// PART 2: apps/frontend/src/pages/dispatch/DispatchBoard.tsx's "Pre-settlement" List View column
// used to render "Driver has open pre-settlement ... add this load to it?" -- a contradiction in
// the owner's own words (a pre-settlement is BY DEFINITION not closed). Replaced with a plain
// pre-settlement number (alwaysVisible, no warning language, no "add to it" prompt). This guard
// asserts the warning language is gone and the column is alwaysVisible.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const LOAD_COSTS_ROUTE = path.join(repoRoot, "apps/backend/src/accounting/load-costs-board.routes.ts");
const DISPATCH_BOARD = path.join(repoRoot, "apps/frontend/src/pages/dispatch/DispatchBoard.tsx");

/** Pure: does this is_resettlement CTE source snippet still contain the over-broad settlement-status branch? */
export function auditLoadCostsResettlementSource(src) {
  const failures = [];
  if (/ds\.trip_closed_at IS NOT NULL OR ds\.status IN \('closed',\s*'approved',\s*'paid'\)/.test(src)) {
    failures.push('is_resettlement still short-circuits on ds.trip_closed_at/ds.status alone -- this wrongly hides a load still genuinely open (its own status not closed/invoiced/paid) purely because its settlement auto-closed on delivery');
  }
  if (!/EXISTS \(\s*SELECT 1 FROM mdata\.loads original/.test(src)) {
    failures.push('the first_load-status/invoice EXISTS check (the correct signal) is missing -- the whole is_resettlement branch may have been gutted, not just the over-broad clause');
  }
  if (!/REG-040 resettlement continuation/.test(src)) {
    failures.push('the REG-040 continuation EXISTS check is missing -- removing the over-broad branch must not also remove the genuine continuation signal');
  }
  return failures;
}

/** Pure: does the DispatchBoard source still contain the contradictory "open pre-settlement" warning? */
export function auditDispatchBoardPreSettlementSource(src) {
  const failures = [];
  if (/Driver has open pre-settlement/.test(src)) {
    failures.push('DispatchBoard.tsx still renders "Driver has open pre-settlement" -- the contradictory warning is still present');
  }
  if (/add this load to it\?/.test(src)) {
    failures.push('DispatchBoard.tsx still renders the "add this load to it?" prompt language');
  }
  const colMatch = src.match(/\{\s*key:\s*"pre_settlement"[\s\S]*?\}/);
  if (!colMatch) {
    failures.push('the pre_settlement column definition could not be found');
  } else {
    if (!/alwaysVisible:\s*true/.test(colMatch[0])) {
      failures.push('the pre_settlement column is not alwaysVisible -- List View should show it by default, not hide it behind the gear');
    }
    if (/defaultHidden:\s*true/.test(colMatch[0])) {
      failures.push('the pre_settlement column still carries defaultHidden: true');
    }
  }
  return failures;
}

function selftest() {
  const assert = { ok: (c, m) => { if (!c) throw new Error(m); } };

  const badRoute = `(ds.trip_closed_at IS NOT NULL OR ds.status IN ('closed', 'approved', 'paid') OR EXISTS ( SELECT 1 FROM mdata.loads original WHERE ... )) OR EXISTS ( SELECT 1 FROM driver_finance.presettlement_link_suggestions continuation WHERE continuation.suggested_reason LIKE 'REG-040 resettlement continuation%' )`;
  assert.ok(auditLoadCostsResettlementSource(badRoute).length === 1, "the pre-fix over-broad clause must be caught");

  const goodRoute = `(EXISTS ( SELECT 1 FROM mdata.loads original WHERE original.id = ds.first_load_id ... )) OR EXISTS ( SELECT 1 FROM driver_finance.presettlement_link_suggestions continuation WHERE continuation.suggested_reason LIKE 'REG-040 resettlement continuation%' )`;
  assert.ok(auditLoadCostsResettlementSource(goodRoute).length === 0, "the fixed shape must pass: " + JSON.stringify(auditLoadCostsResettlementSource(goodRoute)));

  const gutted = `(EXISTS ( SELECT 1 FROM mdata.loads original WHERE original.id = ds.first_load_id ... ))`;
  assert.ok(auditLoadCostsResettlementSource(gutted).length === 1, "removing the REG-040 continuation check too must be caught");

  const badBoard = `<span className="font-semibold">Driver has open pre-settlement</span> ... add this load to it?`;
  assert.ok(auditDispatchBoardPreSettlementSource(badBoard).length >= 2, "the pre-fix warning language must be caught");

  const goodBoard = `{ key: "pre_settlement", header: "Pre-settlement", cell: (load) => renderPreSettlementNumber(load), alwaysVisible: true },`;
  assert.ok(auditDispatchBoardPreSettlementSource(goodBoard).length === 0, "the fixed shape must pass: " + JSON.stringify(auditDispatchBoardPreSettlementSource(goodBoard)));

  const hiddenCol = `{ key: "pre_settlement", header: "Pre-settlement", cell: (load) => renderPreSettlementNumber(load), defaultHidden: true },`;
  assert.ok(auditDispatchBoardPreSettlementSource(hiddenCol).length >= 1, "a still-hidden column must be caught even with the warning language removed");

  console.log("verify-load-costs-open-status-and-list-view-presettlement --selftest PASS");
}

function run() {
  const failures = [];
  const readOrFail = (p) => {
    if (!fs.existsSync(p)) { failures.push(`${path.relative(repoRoot, p)}: missing`); return ""; }
    return fs.readFileSync(p, "utf8");
  };

  const routeSrc = readOrFail(LOAD_COSTS_ROUTE);
  if (routeSrc) failures.push(...auditLoadCostsResettlementSource(routeSrc).map((f) => `load-costs-board.routes.ts: ${f}`));

  const boardSrc = readOrFail(DISPATCH_BOARD);
  if (boardSrc) failures.push(...auditDispatchBoardPreSettlementSource(boardSrc).map((f) => `DispatchBoard.tsx: ${f}`));

  if (failures.length) {
    console.error("verify-load-costs-open-status-and-list-view-presettlement FAILED:");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(
    "verify-load-costs-open-status-and-list-view-presettlement: OK -- Load Costs no longer hides a " +
      "genuinely-open load purely because its settlement auto-closed, and List View's Pre-settlement " +
      "column shows a plain always-visible number with no contradictory warning"
  );
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
