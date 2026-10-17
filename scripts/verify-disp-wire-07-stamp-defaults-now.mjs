#!/usr/bin/env node
/**
 * CLS-DISP-WIRE-07 — office/bulk delivery-confirmation must stamp actual_departure_at
 * even when the client does not send a delivered_at timestamp.
 *
 * The shared helper stampFinalActiveDeliveryDeparture already COALESCEs to now(),
 * so a missing client timestamp does NOT leave the stop un-departed. This guard
 * keeps that behavior from silently regressing.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HELPER = "apps/backend/src/dispatch/stamp-final-delivery-departure.ts";
// 25f2a8faa4 (R313/R315, auto-status through the canonical transition, #23821): the office transition's delivery stamp
// moved from dispatch/loads.routes.ts into load-transition.service.ts (transitionDispatchLoadInClientTx), which the route
// calls. Same rule, read at the writer; the route must still reach the canonical transition (ROUTE_REACHES below).
const ROUTE = "apps/backend/src/dispatch/loads.routes.ts";
const CALLERS = [
  "apps/backend/src/dispatch/load-transition.service.ts",
  "apps/backend/src/dispatch/loads-bulk.routes.ts",
  "apps/backend/src/mdata/loads.routes.ts",
];

function read(rel, overrides = {}) {
  if (Object.prototype.hasOwnProperty.call(overrides, rel)) return overrides[rel];
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assert(cond, msg, errors) {
  if (!cond) errors.push(msg);
}

export function run(overrides = {}) {
  const errors = [];
  const helper = read(HELPER, overrides);

  assert(
    /export\s+async\s+function\s+stampFinalActiveDeliveryDeparture\b/.test(helper),
    `${HELPER} must export stampFinalActiveDeliveryDeparture`,
    errors
  );
  assert(
    helper.includes("COALESCE($3::timestamptz, now())") && helper.includes("actual_departure_at ="),
    `${HELPER} must default actual_departure_at to now() when deliveredAt is null/undefined`,
    errors
  );
  assert(
    /JOIN mdata\.loads l2 ON l2\.id = s2\.load_id[\s\S]{0,180}l2\.operating_company_id = \$2::uuid/.test(helper),
    `${HELPER} must scope the stop mutation through the canonical parent load company`,
    errors
  );
  assert(
    helper.includes("AND s.actual_departure_at IS NULL"),
    `${HELPER} must NOT overwrite an existing driver-captured departure`,
    errors
  );

  for (const caller of CALLERS) {
    const src = read(caller, overrides);
    assert(
      /stampFinalActiveDeliveryDeparture\s*\([^)]*\)/.test(src),
      `${caller} must invoke stampFinalActiveDeliveryDeparture`,
      errors
    );
    assert(
      /stampFinalActiveDeliveryDeparture\s*\(\s*client\s*,\s*[^,]+\s*,\s*[^,]+\s*,\s*(?:[^)]*delivered_at\s*\?\?\s*null|[^)]*null[^)]*)\)/.test(src),
      `${caller} must pass company, load, and an explicit null fallback to stampFinalActiveDeliveryDeparture`,
      errors
    );
  }

  const route = read(ROUTE, overrides);
  assert(
    /transitionDispatchLoadInClientTx\s*\(/.test(route),
    `${ROUTE} must reach the canonical transition (transitionDispatchLoadInClientTx), which stamps the delivery departure`,
    errors
  );

  return errors;
}

function selftest() {
  // Pure: the planted text is passed in as an override; no file is written.
  const backup = read(HELPER);
  const planted = backup.replace(
    /COALESCE\(\$3::timestamptz,\s*now\(\)\)/,
    "$3::timestamptz"
  );
  const plantedErrors = run({ [HELPER]: planted });
  if (run().length) {
    console.error("verify-disp-wire-07-stamp-defaults-now: SELFTEST FAIL — the live tree is not clean"); process.exit(1);
  }
  if (!plantedErrors.some((e) => e.includes("now()") || e.includes("deliveredAt is null"))) {
    console.error("verify-disp-wire-07-stamp-defaults-now: SELFTEST FAIL — planted COALESCE removal not detected"); process.exit(1);
  }
  const transition = read(CALLERS[0]);
  if (!run({ [CALLERS[0]]: transition.replace(/stampFinalActiveDeliveryDeparture\(\s*client,/, "noStamp(client,") }).length) {
    console.error("verify-disp-wire-07-stamp-defaults-now: SELFTEST FAIL — a transition that stops stamping was not detected"); process.exit(1);
  }
  if (!run({ [ROUTE]: read(ROUTE).replace(/transitionDispatchLoadInClientTx\s*\(/g, "otherTransition(") }).length) {
    console.error("verify-disp-wire-07-stamp-defaults-now: SELFTEST FAIL — a route that bypasses the transition was not detected"); process.exit(1);
  }
  console.log(`verify-disp-wire-07-stamp-defaults-now: SELFTEST PASS (${plantedErrors.length} planted failures detected)`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const errors = run();
  if (errors.length) {
    console.error("verify-disp-wire-07-stamp-defaults-now: FAIL");
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log("verify-disp-wire-07-stamp-defaults-now: OK — delivery stamp defaults to now() and preserves existing driver-captured departures");
}

main();
