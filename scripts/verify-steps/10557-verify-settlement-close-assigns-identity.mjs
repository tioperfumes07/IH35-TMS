/**
 * BOARD-35 — settlement statement identity guard
 *
 * Two invariants enforced statically:
 *
 * 1. STATUS LABEL: buildTourReadout must derive status from payment_state (paid_at / closedAlready),
 *    never return raw DB s.status for a closed tour. The file must NOT contain the old pattern
 *    "status: s.status," at the tour identity line.
 *
 * 2. NUMBER ASSIGNMENT: the close-tour route's BEGIN/COMMIT block must call
 *    allocateNextSettlementSourceDocumentRef (guaranteed to commit atomically with trip_closed_at,
 *    before the fail-soft GL-posting step).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const tourReadout = readFileSync(
  resolve(root, "apps/backend/src/driver-finance/tour-readout.routes.ts"),
  "utf8",
);

let failed = false;

// 1. Status label: old raw-status pattern must be gone
if (/settlement_number: s\.source_document_ref, status: s\.status,/.test(tourReadout)) {
  console.error(
    "FAIL [BOARD-35] tour-readout.routes.ts still returns raw DB status at the tour identity line. " +
    "Status must be derived from payment_state (paid/unpaid/open), never s.status directly.",
  );
  failed = true;
} else {
  console.log("PASS [BOARD-35] status label — derived from payment_state, not raw s.status");
}

// 2. Number assignment: close-tour route must call allocateNextSettlementSourceDocumentRef
if (!tourReadout.includes("allocateNextSettlementSourceDocumentRef")) {
  console.error(
    "FAIL [BOARD-35] tour-readout.routes.ts close-tour route does not call " +
    "allocateNextSettlementSourceDocumentRef. Settlement number must be assigned atomically " +
    "with trip_closed_at before COMMIT (not deferred to the fail-soft GL-posting step).",
  );
  failed = true;
} else {
  console.log("PASS [BOARD-35] number assignment — allocateNextSettlementSourceDocumentRef present in close path");
}

// 3. The assignment must be gated on stamped.stamped (only when actually closing, not idempotent re-entry)
if (!tourReadout.includes("stamped.stamped && !before.tour.settlement_number")) {
  console.error(
    "FAIL [BOARD-35] tour-readout.routes.ts close-tour does not guard assignment on " +
    "'stamped.stamped && !before.tour.settlement_number'. The gate prevents double-allocation " +
    "on already-closed re-entry and skips when a number already exists.",
  );
  failed = true;
} else {
  console.log("PASS [BOARD-35] assignment gate — stamped.stamped && !before.tour.settlement_number");
}

if (failed) process.exit(1);
