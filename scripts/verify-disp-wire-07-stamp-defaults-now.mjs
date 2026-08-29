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
const CALLERS = [
  "apps/backend/src/dispatch/loads.routes.ts",
  "apps/backend/src/dispatch/loads-bulk.routes.ts",
  "apps/backend/src/mdata/loads.routes.ts",
];

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assert(cond, msg, errors) {
  if (!cond) errors.push(msg);
}

export function run() {
  const errors = [];
  const helper = read(HELPER);

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
    const src = read(caller);
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

  return errors;
}

function selftest() {
  const p = path.join(ROOT, HELPER);
  const backup = fs.readFileSync(p, "utf8");
  try {
    const planted = backup.replace(
      /COALESCE\(\$3::timestamptz,\s*now\(\)\)/,
      "$3::timestamptz"
    );
    fs.writeFileSync(p, planted, "utf8");
    const plantedErrors = run();
    assert(
      plantedErrors.some((e) => e.includes("now()") || e.includes("deliveredAt is null")),
      "selftest expected planted COALESCE removal to be detected",
      plantedErrors
    );
    console.log(`verify-disp-wire-07-stamp-defaults-now: SELFTEST PASS (${plantedErrors.length} planted failures detected)`);
  } finally {
    fs.writeFileSync(p, backup, "utf8");
  }
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
