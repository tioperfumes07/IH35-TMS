#!/usr/bin/env node
/**
 * CLS-DISP-WIRE-07 — office/bulk/mdata delivery status MUST stamp final delivery
 * `actual_departure_at` via the shared helper (never overwrite driver capture).
 *
 * Defect: only PATCH /dispatch/loads/:id/transition stamped stops; DispatchBoard
 * bulk set_status + mdata /loads/:id/status flipped load status with 0 departures.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function mustInclude(rel, needles, label) {
  const src = read(rel);
  for (const n of needles) {
    if (!src.includes(n)) {
      console.error(`FAIL ${label}: ${rel} missing ${JSON.stringify(n)}`);
      process.exit(1);
    }
  }
}

const helper = "apps/backend/src/dispatch/stamp-final-delivery-departure.ts";
mustInclude(
  helper,
  [
    "stampFinalActiveDeliveryDeparture",
    "loadStatusRequiresDeliveryDepartureStamp",
    "actual_departure_at = COALESCE($2::timestamptz, now())",
    "AND s.actual_departure_at IS NULL",
    "stop_type::text = 'delivery'",
  ],
  "helper"
);

mustInclude(
  "apps/backend/src/dispatch/loads.routes.ts",
  ["stampFinalActiveDeliveryDeparture", "loadStatusRequiresDeliveryDepartureStamp"],
  "transition"
);

mustInclude(
  "apps/backend/src/dispatch/loads-bulk.routes.ts",
  ["stampFinalActiveDeliveryDeparture", "loadStatusRequiresDeliveryDepartureStamp", "delivered_at"],
  "bulk"
);

mustInclude(
  "apps/backend/src/mdata/loads.routes.ts",
  ["stampFinalActiveDeliveryDeparture", "loadStatusRequiresDeliveryDepartureStamp"],
  "mdata-status"
);

mustInclude(
  "apps/frontend/src/pages/dispatch/DispatchBoard.tsx",
  ["delivered_at: new Date().toISOString()"],
  "board-bulk"
);

// Dual-path kill: no second inline UPDATE that bypasses the helper in bulk/mdata.
for (const rel of [
  "apps/backend/src/dispatch/loads-bulk.routes.ts",
  "apps/backend/src/mdata/loads.routes.ts",
]) {
  const src = read(rel);
  if (/UPDATE mdata\.load_stops[\s\S]*actual_departure_at\s*=/.test(src)) {
    console.error(`FAIL ${rel}: inline load_stops actual_departure_at UPDATE — use shared stamp helper`);
    process.exit(1);
  }
}

if (process.argv.includes("--selftest")) {
  console.log("verify-wire-07-actual-departure-stamp: selftest OK");
  process.exit(0);
}

console.log("verify-wire-07-actual-departure-stamp: OK — shared stamp on transition + bulk + mdata");
