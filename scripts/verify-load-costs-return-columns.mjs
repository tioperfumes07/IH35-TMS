#!/usr/bin/env node
// LOAD-COSTS-RETURN-COLS (owner 2026-09-08): Load Costs board needs "Days Since Delivery" /
// "Return Booked" columns, reusing the SAME computed data Dispatch Home's "Units Needing Return"
// tile and RoundTrips.tsx's NB/TR/SB pairing already produce -- never a second copy of the
// hours-since-delivery math or the outbound/return pairing logic. Also: an unassigned-unit load
// must render "Unassigned" on the Unit column, distinct from the generic "—" used for untracked
// cells elsewhere on this board.
import fs from "node:fs";

const LABEL = "verify-load-costs-return-columns";
const BOARD_FILE = "apps/frontend/src/pages/accounting/LoadCostsBoardPage.tsx";
const LEGS_FILE = "apps/frontend/src/pages/dispatch/roundTripsLegs.ts";
const ROUND_TRIPS_FILE = "apps/frontend/src/pages/dispatch/RoundTrips.tsx";

export function boardReusesUnitsWithoutLoad(boardSrc) {
  return (
    /import\s*\{\s*listUnitsWithoutLoad\s*\}\s*from\s*"\.\.\/\.\.\/api\/dispatch"/.test(boardSrc) &&
    /key: "days_since_delivery"/.test(boardSrc) &&
    /daysSinceDeliveryByUnit/.test(boardSrc) &&
    /hours_since_last_delivery/.test(boardSrc)
  );
}

export function boardReusesPairing(boardSrc) {
  return (
    /import\s*\{\s*pairOutboundReturn,\s*NEEDS_RETURN_STATUSES\s*\}\s*from\s*"\.\.\/dispatch\/roundTripsLegs"/.test(
      boardSrc
    ) &&
    /key: "return_booked"/.test(boardSrc) &&
    /pairOutboundReturn\(unitLoads\)/.test(boardSrc)
  );
}

export function unassignedUnitIsLabeled(boardSrc) {
  const m = boardSrc.match(/key: "unit", label: "Unit", testId: "col-unit"[^}]*\}/);
  if (!m) return false;
  return /render: r => r\.unit_number \?\? "Unassigned"/.test(m[0]);
}

export function needsReturnStatusesSharedNotDuplicated(legsSrc, roundTripsSrc) {
  const exportedFromLegs = /export const NEEDS_RETURN_STATUSES = new Set\(/.test(legsSrc);
  const roundTripsImportsIt = /NEEDS_RETURN_STATUSES/.test(roundTripsSrc) && /from "\.\/roundTripsLegs"/.test(roundTripsSrc);
  const roundTripsRedefinesIt = /^const NEEDS_RETURN_STATUSES = new Set\(/m.test(roundTripsSrc);
  return exportedFromLegs && roundTripsImportsIt && !roundTripsRedefinesIt;
}

function violations(boardSrc, legsSrc, roundTripsSrc) {
  const errors = [];
  if (!boardReusesUnitsWithoutLoad(boardSrc)) {
    errors.push("Days Since Delivery column missing or not wired to listUnitsWithoutLoad's hours_since_last_delivery");
  }
  if (!boardReusesPairing(boardSrc)) {
    errors.push("Return Booked column missing or not wired to roundTripsLegs.ts's pairOutboundReturn/NEEDS_RETURN_STATUSES");
  }
  if (!unassignedUnitIsLabeled(boardSrc)) {
    errors.push('Unit column no longer renders "Unassigned" for a load with no unit — regressed back to a bare dash');
  }
  if (!needsReturnStatusesSharedNotDuplicated(legsSrc, roundTripsSrc)) {
    errors.push("NEEDS_RETURN_STATUSES is not the ONE shared export from roundTripsLegs.ts — RoundTrips.tsx and LoadCostsBoardPage.tsx can drift again");
  }
  return errors;
}

function check(boardSrc, legsSrc, roundTripsSrc) {
  const errors = violations(boardSrc, legsSrc, roundTripsSrc);
  if (errors.length) throw new Error(errors.join("; "));
}

const boardSrc = fs.readFileSync(BOARD_FILE, "utf8");
const legsSrc = fs.readFileSync(LEGS_FILE, "utf8");
const roundTripsSrc = fs.readFileSync(ROUND_TRIPS_FILE, "utf8");

if (process.argv.includes("--selftest")) {
  let caught = 0;
  const mutations = [
    [boardSrc.replace('import { listUnitsWithoutLoad } from "../../api/dispatch";', ""), legsSrc, roundTripsSrc],
    [
      boardSrc.replace(
        'import { pairOutboundReturn, NEEDS_RETURN_STATUSES } from "../dispatch/roundTripsLegs";',
        ""
      ),
      legsSrc,
      roundTripsSrc,
    ],
    [
      boardSrc.replace(
        'render: r => r.unit_number ?? "Unassigned"',
        'render: r => r.unit_number ?? "—"'
      ),
      legsSrc,
      roundTripsSrc,
    ],
    [
      boardSrc,
      legsSrc.replace("export const NEEDS_RETURN_STATUSES = new Set(", "const NEEDS_RETURN_STATUSES = new Set("),
      roundTripsSrc,
    ],
    [
      boardSrc,
      legsSrc,
      roundTripsSrc + '\nconst NEEDS_RETURN_STATUSES = new Set(["dispatched"]);\n',
    ],
  ];
  for (const [b, l, r] of mutations) {
    try {
      check(b, l, r);
    } catch {
      caught += 1;
      continue;
    }
    throw new Error("a mutation escaped detection");
  }
  check(boardSrc, legsSrc, roundTripsSrc);
  console.log(`${LABEL} SELFTEST PASS (${caught}/${mutations.length} planted defects caught)`);
} else {
  check(boardSrc, legsSrc, roundTripsSrc);
  console.log(
    `${LABEL} PASS -- Days Since Delivery + Return Booked columns reuse Dispatch Home's own computed data, Unit column labels unassigned loads honestly, NEEDS_RETURN_STATUSES has one shared definition`
  );
}
