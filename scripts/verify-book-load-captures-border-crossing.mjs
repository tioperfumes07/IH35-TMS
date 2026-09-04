#!/usr/bin/env node
// GUARD — WIZ border-capture (owner block 2026-09-04, load 13508).
//
// Defect: Book Load let a cross-border (NB/SB) load save with NO border crossing, so
// LoadDetailDrawer.loadHasCrossBorder() correctly hid the Customs tab. The fix CAPTURES the crossing
// in the wizard (a stop_type='border' stop), it must NEVER weaken the tab predicate.
//
// This guard fails if:
//   1) the loadHasCrossBorder predicate is weakened (its two real conditions must remain), or
//   2) the create schema / service stop type no longer accepts 'border', or
//   3) the wizard drops the border-crossing capture or its required gate.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

const failures = [];
const check = (cond, msg) => {
  if (!cond) failures.push(msg);
};

// 1) Predicate must NOT be weakened.
const drawer = read("apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx");
check(
  /stop_type\s*===\s*"border"/.test(drawer),
  "LoadDetailDrawer.loadHasCrossBorder must still show Customs on a stop_type==='border' stop."
);
check(
  /\[\s*"US"\s*,\s*"USA"\s*,\s*"United States"\s*\]/.test(drawer),
  "LoadDetailDrawer.loadHasCrossBorder must still key its non-US country test off [US, USA, United States] — predicate not weakened."
);

// 2) Backend accepts a border stop end-to-end.
const routes = read("apps/backend/src/dispatch/loads.routes.ts");
check(
  /stop_type:\s*z\.enum\(\[\s*"pickup"\s*,\s*"delivery"\s*,\s*"border"\s*\]\)/.test(routes),
  "createDispatchLoadBodySchema stop_type must accept 'border' so Book Load can persist the crossing stop."
);
const service = read("apps/backend/src/dispatch/book-load.service.ts");
check(
  /stop_type:\s*"pickup"\s*\|\s*"delivery"\s*\|\s*"border"/.test(service),
  "book-load.service BookLoadStop.stop_type must accept 'border'."
);

// 3) Wizard capture + required gate.
const modal = read("apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx");
check(
  /BorderCrossingCaptureField/.test(modal),
  "BookLoadModalV4 must render the BorderCrossingCaptureField for cross-border loads."
);
check(
  /isCrossBorderTripType\(values\.trip_type\)\s*&&\s*!values\.border_port_of_entry_id/.test(modal),
  "BookLoadModalV4 must block a cross-border (NB/SB) save when no port of entry was captured (fail loud, no silent drop)."
);
check(
  /withBorderCrossingStop\(values\.stops/.test(modal),
  "BookLoadModalV4 must inject the border stop into the submitted stops for a cross-border load."
);

// 4) Pure helper exists and is honest about NB/SB only.
const helper = read("apps/frontend/src/pages/dispatch/components/book-load-v4/borderCrossingStop.ts");
check(/export function isCrossBorderTripType/.test(helper), "borderCrossingStop.ts must export isCrossBorderTripType.");
check(/export function withBorderCrossingStop/.test(helper), "borderCrossingStop.ts must export withBorderCrossingStop.");
check(/stop_type:\s*"border"/.test(helper), "borderCrossingStop.ts must build a stop_type='border' stop.");

if (failures.length) {
  console.error("verify-book-load-captures-border-crossing: FAIL");
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
console.log("verify-book-load-captures-border-crossing: PASS");
