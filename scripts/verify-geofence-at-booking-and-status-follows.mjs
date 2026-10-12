#!/usr/bin/env node
/**
 * G11 + AJK-03 (443.129): fences at booking (geocode_precision at stop INSERT) + load status follows
 * fence evidence ONLY through the ONE transition engine (never a raw UPDATE mdata.loads SET status).
 *
 * Owned paths (gate-step-map):
 *   apps/backend/src/dispatch/book-load.service.ts
 *   apps/backend/src/telematics/geofence-detector.service.ts
 *   apps/backend/src/dispatch/load-transition.service.ts
 *   apps/backend/src/dispatch/geofence-auto-delivery.service.ts
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runGuard, runGuardInFixture, statusOf, outputOf, reportSelftest } from "./lib/guard-selftest.mjs";

if (process.argv.includes("--selftest")) selftest();

const book = readFileSync("apps/backend/src/dispatch/book-load.service.ts", "utf8");
const detector = readFileSync("apps/backend/src/telematics/geofence-detector.service.ts", "utf8");
const tx = readFileSync("apps/backend/src/dispatch/load-transition.service.ts", "utf8");
const auto = readFileSync("apps/backend/src/dispatch/geofence-auto-delivery.service.ts", "utf8");

const checks = [
  [
    /geocode_precision, geocode_source/.test(book) && /geocodePrecision/.test(book),
    "book-load stop INSERT writes geocode_precision so bindLoadToGeofences can fence at booking",
  ],
  [
    /transitionDispatchLoadInClientTx\(/.test(detector) && /GEOFENCE_AUTO_DELIVERY_ACTOR/.test(detector),
    "detector advances load status via transitionDispatchLoadInClientTx + GEOFENCE_AUTO_DELIVERY_ACTOR",
  ],
  [
    !/UPDATE\s+mdata\.loads[\s\S]{0,200}SET\s+status\s*=/.test(detector),
    "detector never raw-UPDATE mdata.loads SET status (AJK-03 — one transition engine)",
  ],
  [
    /walkLoadStatusFromFence\(/.test(detector) &&
      /"in_transit"/.test(detector) &&
      /"delivered_pending_docs"/.test(detector),
    "detector walks first pickup departure → in_transit and final delivery arrival → delivered_pending_docs",
  ],
  [
    /export async function transitionDispatchLoadInClientTx\(/.test(tx),
    "canonical transition service remains the office + fence shared engine",
  ],
  [
    /export const GEOFENCE_AUTO_DELIVERY_ACTOR/.test(auto),
    "fence actor is the shared system actor used by auto-delivery and the detector",
  ],
];

const fails = checks.filter(([ok]) => !ok).map(([, w]) => w);
if (fails.length) {
  console.error("verify-geofence-at-booking-and-status-follows: FAIL\n  " + fails.join("\n  "));
  process.exit(1);
}
console.log(`verify-geofence-at-booking-and-status-follows: OK (${checks.length})`);

function selftest() {
  const me = fileURLToPath(import.meta.url);
  const real = runGuard(me);
  const missing = runGuardInFixture(me, {});
  // Planted tree with a detector that still raw-UPDATEs status — must fail closed.
  const oldDetector = runGuardInFixture(me, {
    "apps/backend/src/dispatch/book-load.service.ts":
      "geocode_precision, geocode_source\nconst geocodePrecision = 'rooftop';\n",
    "apps/backend/src/telematics/geofence-detector.service.ts": `
      // old partial G11 — raw status UPDATE (AJK-03 violation)
      await client.query(\`UPDATE mdata.loads SET status = 'in_transit'\`);
      walkLoadStatusFromFence();
      "in_transit";
      "delivered_pending_docs";
    `,
    "apps/backend/src/dispatch/load-transition.service.ts":
      "export async function transitionDispatchLoadInClientTx() {}\n",
    "apps/backend/src/dispatch/geofence-auto-delivery.service.ts":
      "export const GEOFENCE_AUTO_DELIVERY_ACTOR = 'x';\n",
  });
  reportSelftest("verify-geofence-at-booking-and-status-follows", [
    {
      name: "real repo tree passes",
      pass: statusOf(real) === 0,
      detail: statusOf(real) === 0 ? undefined : outputOf(real).slice(-400),
    },
    { name: "guard fails closed when its inputs are absent", pass: statusOf(missing) !== 0 },
    {
      name: "guard fails closed on raw UPDATE mdata.loads SET status (old AJK-03 hole)",
      pass: statusOf(oldDetector) !== 0,
      detail: statusOf(oldDetector) !== 0 ? undefined : outputOf(oldDetector).slice(-400),
    },
  ]);
}
