#!/usr/bin/env node
// ROUND 155.23 (owner P0, restated twice, 2026-09-28): "ONLY CURRENT LOAD DATA AND CURRENT TOUR
// SETTLEMENT DATA SHOULD BE APPEARING." Root cause, live-confirmed: settlement-creator.service.ts
// stamps mdata.loads.presettlement_link_id onto every load a settlement draft names, with no
// tour_id check — three loads on three different tours (13609 tour_id NULL, 13614 tour_id B, 13639
// tour_id C) all carried presettlement_link_id pointing at the SAME settlement purely because they
// share a driver. tour-readout.routes.ts's buildTourReadout then rendered a fabricated multi-leg
// "tour", mixing a CLOSED load's revenue/pay into an OPEN settlement's totals — a real double-pay
// risk once that settlement closes.
//
// Fix: the /api/v1/loads/:loadId/tour-readout route now (a) returns an honest "not on a tour"
// response immediately when the subject load's own tour_id is NULL, never falling through to
// presettlement_link_id/first_load_id/last_load_id, and (b) passes the subject's tour_id into
// buildTourReadout as `scopeToTourId`, which the legs CTE uses as the ONLY additional grouping key
// (never driver_id, never unit_id) and which also excludes a CLOSED load from an OPEN settlement's
// legs/totals entirely.
//
// This guard is a STATIC source-shape check (the live-data proof — a real fabricated-tour case
// live on prod — was already fixed once by 13609's own scenario; the guard exists so the pattern
// can never silently regress). It fails if:
//   (a) the per-load tour-readout route resolves a settlement without first checking the subject
//       load's own tour_id for NULL, or
//   (b) buildTourReadout's legs-selecting SQL ever joins/groups on driver_id or unit_id to decide
//       tour membership, or
//   (c) the legs CTE loses either the tour_id-scoping condition or the closed-load exclusion.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-presettlement-shows-only-this-load-and-its-open-tour";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = path.join(ROOT, "apps/backend/src/driver-finance/tour-readout.routes.ts");

export function findViolations(src) {
  const violations = [];

  if (!/if\s*\(!subject\.tour_id\)/.test(src)) {
    violations.push("the per-load route no longer short-circuits on a NULL subject tour_id before resolving a settlement");
  }
  if (!/scopeToTourId/.test(src)) {
    violations.push("buildTourReadout no longer accepts/uses a scopeToTourId parameter");
  }
  if (!/l\.tour_id\s*=\s*\$6::uuid/.test(src)) {
    violations.push("the legs CTE no longer filters by l.tour_id = the subject's own tour_id");
  }
  // ROUND 218.2 (#23103): bare 'closed' became CLOSED_LOAD_STATUS from
  // canonical-active-load-set (identical SQL at runtime). Accept either shape.
  if (
    !/l\.status\s*<>\s*'closed'/.test(src) &&
    !/l\.status\s*<>\s*'\$\{CLOSED_LOAD_STATUS\}'/.test(src)
  ) {
    violations.push("the legs CTE no longer excludes closed loads from an open settlement");
  }

  // The actual anti-pattern this round fixed: assembling tour legs by matching driver_id/unit_id
  // instead of tour_id. Scan the legs CTE region specifically (between "WITH legs AS" and its
  // closing) for a join/predicate on those columns used as a membership test.
  const ctxStart = src.indexOf("WITH legs AS");
  const ctxEnd = src.indexOf("SELECT l.id::text AS load_id");
  if (ctxStart !== -1 && ctxEnd !== -1) {
    const legsCte = src.slice(ctxStart, ctxEnd);
    if (/l\.driver_id\s*=|l\.assigned_primary_driver_id\s*=\s*\$|l\.assigned_unit_id\s*=\s*\$\d/.test(legsCte)) {
      violations.push("the legs CTE appears to join/filter on driver_id or unit_id to assemble tour membership");
    }
  }

  return violations;
}

function selftest() {
  const failures = [];
  const t = (l, c) => { if (!c) failures.push(l); };

  const clean = fs.readFileSync(FILE, "utf8");
  t("the real, current file is clean", findViolations(clean).length === 0);

  const dirtyNoNullCheck = clean.replace(/if\s*\(!subject\.tour_id\)/, "if (false)");
  t("removing the NULL tour_id short-circuit is caught", findViolations(dirtyNoNullCheck).length >= 1);

  const dirtyNoScopeParam = clean.replace(/scopeToTourId/g, "removedParam");
  t("removing scopeToTourId is caught", findViolations(dirtyNoScopeParam).length >= 1);

  const dirtyNoTourFilter = clean.replace(/l\.tour_id\s*=\s*\$6::uuid/, "true");
  t("removing the tour_id legs filter is caught", findViolations(dirtyNoTourFilter).length >= 1);

  const dirtyNoClosedExclusion = clean.replace(
    /AND \(\$7::boolean IS FALSE OR l\.status <> '(?:closed|\$\{CLOSED_LOAD_STATUS\})'\)/,
    "AND (true)"
  );
  t("removing the closed-load exclusion is caught", findViolations(dirtyNoClosedExclusion).length >= 1);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:\n  - ${failures.join("\n  - ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} selftest OK — 5 cases`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

function run() {
  if (!fs.existsSync(FILE)) {
    console.error(`${LABEL}: FAIL — ${path.relative(ROOT, FILE)} not found`);
    process.exit(1);
  }
  const src = fs.readFileSync(FILE, "utf8");
  const violations = findViolations(src);
  if (violations.length > 0) {
    console.error(`${LABEL}: FAIL —`);
    for (const v of violations) console.error(`  ✗ ${v}`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS`);
}

run();
