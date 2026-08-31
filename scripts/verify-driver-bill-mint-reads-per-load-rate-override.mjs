#!/usr/bin/env node
/**
 * SETL-45-DRIVER-BILL-MINT-DROPS-PER-LOAD-RATE-OVERRIDE — static-shape guard.
 *
 * ensureDriverBillArtifactsForLoad (called from loads.routes.ts's status-transition handler at
 * delivered_pending_docs / completed_docs_received) issues its own SELECT of mdata.loads before
 * handing that row to createDriverBillArtifacts -> resolveDriverBasePayCents, which reads
 * load.driver_pay_rate_per_mile FIRST (before the driver-rate-card fallback). If that SELECT ever
 * drops the column again, a per-load rate honored at Book Load time goes invisible at mint time and
 * the load produces zero driver_bills / zero settlement_lines even though it was correctly priced --
 * live-reproduced 2026-08-31 on a real TEST load ($117.60 priced at book, zero driver_bills at close).
 */
import { readFileSync } from "node:fs";

const FILE = "apps/backend/src/dispatch/book-load.service.ts";

function analyze(src) {
  const failures = [];

  const fnStart = src.indexOf("export async function ensureDriverBillArtifactsForLoad");
  if (fnStart < 0) {
    failures.push(`${FILE}: ensureDriverBillArtifactsForLoad not found`);
    return failures;
  }
  const nextFn = src.indexOf("\nexport ", fnStart + 1);
  const fnBody = src.slice(fnStart, nextFn >= 0 ? nextFn : undefined);

  const selectMatch = /SELECT id, operating_company_id[\s\S]*?FROM mdata\.loads/.exec(fnBody);
  if (!selectMatch) {
    failures.push(`${FILE}: ensureDriverBillArtifactsForLoad's SELECT ... FROM mdata.loads not found in its expected shape`);
    return failures;
  }
  if (!/driver_pay_rate_per_mile/.test(selectMatch[0])) {
    failures.push(
      `${FILE}: ensureDriverBillArtifactsForLoad's SELECT does not include driver_pay_rate_per_mile -- a ` +
        "per-load rate override honored at Book Load time will silently go unpriced at mint time"
    );
  }

  return failures;
}

function readAll() {
  return { src: readFileSync(FILE, "utf8") };
}

function selftest() {
  const { src } = readAll();
  const good = analyze(src);
  if (good.length > 0) {
    console.error("verify-driver-bill-mint-reads-per-load-rate-override --selftest: FAIL on the real (good) file");
    for (const f of good) console.error(`  - ${f}`);
    process.exit(1);
  }

  const mutated = src.replace(
    "requires_tarps, miles_shortest, miles_practical, driver_pay_rate_per_mile",
    "requires_tarps, miles_shortest, miles_practical"
  );
  if (mutated === src) {
    console.error("verify-driver-bill-mint-reads-per-load-rate-override --selftest: mutation did not change the source -- pattern out of sync");
    process.exit(1);
  }
  const failures = analyze(mutated);
  if (failures.length === 0) {
    console.error("verify-driver-bill-mint-reads-per-load-rate-override --selftest: NOT CAUGHT -- dropping driver_pay_rate_per_mile from the SELECT");
    process.exit(1);
  }
  console.log("  caught: dropping driver_pay_rate_per_mile from ensureDriverBillArtifactsForLoad's SELECT");
  console.log("SELFTEST PASS: 1/1 planted regression caught.");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const { src } = readAll();
  const failures = analyze(src);
  if (failures.length > 0) {
    console.error("verify-driver-bill-mint-reads-per-load-rate-override: FAIL");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(
    "verify-driver-bill-mint-reads-per-load-rate-override: OK -- ensureDriverBillArtifactsForLoad's SELECT carries driver_pay_rate_per_mile, so a per-load rate override survives from Book Load time to mint time"
  );
}
