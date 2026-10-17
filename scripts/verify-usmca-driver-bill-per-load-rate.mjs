#!/usr/bin/env node
/**
 * USMCA Book Load → driver bill wiring ratchet.
 *
 * Ensures that a per-mile rate entered on the load itself is consumed by the
 * driver-bill mint path, so USMCA loads can produce driver bills even before a
 * per-driver rate card is configured.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Selftest plants (rel path -> planted text); nothing is written to disk.
const PLANTED = new Map();

function read(rel) {
  if (PLANTED.has(rel)) return PLANTED.get(rel);
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assert(cond, msg, errors) {
  if (!cond) errors.push(msg);
}

export function run() {
  const errors = [];
  const bookLoad = read("apps/backend/src/dispatch/book-load.service.ts");
  const bookLoadTest = read("apps/backend/src/driver-finance/__tests__/driver-bills.test.ts");
  const bookModal = read("apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx");

  assert(
    // Anchored to the actual resolution call site, not a bare substring-anywhere-in-file check.
    // book-load.service.ts also mentions "load.driver_pay_rate_per_mile" in two comments and in the
    // unrelated PATCH-side write `load.driver_pay_rate_per_mile = input....` further down — a loose
    // /load\.driver_pay_rate_per_mile/ regex still matches those even if the real functional READ at
    // the resolveDriverBasePayCents call site is broken, which is exactly how this guard's own
    // selftest went blind to its own planted mutation (found live, 2026-09-01).
    /perLoadRateDollars\s*=\s*Number\(load\.driver_pay_rate_per_mile/.test(bookLoad),
    "book-load.service.ts's resolveDriverBasePayCents must read load.driver_pay_rate_per_mile",
    errors,
  );
  assert(
    /load\.miles_shortest/.test(bookLoad),
    "book-load.service.ts must read load.miles_shortest",
    errors,
  );
  assert(
    // Repointed (ROUND 443.187): 9dca3e6acc "ROUND 443.33: booking priced a load 1 cent off ... every
    // miles x rate now prices through milesTimesRateCents (#26254)" replaced the raw
    // Math.round(perLoadRateDollars * 100 * perLoadMiles) with the one money rule.
    /milesTimesRateCents\(perLoadMiles, perLoadRateDollars \* 100\)/.test(bookLoad),
    "book-load.service.ts must convert per-load $/mi to cents",
    errors,
  );
  assert(
    /createDriverBillArtifacts\s*\(/.test(bookLoad),
    "book-load.service.ts must call createDriverBillArtifacts",
    errors,
  );
  // Repointed (ROUND 443.187): 25f2a8faa4 "R313-E31 ... office transition extracted to
  // dispatch/load-transition.service.ts (route delegates) (#23821)" moved the delivery mint out of
  // loads.routes.ts. The route must delegate to transitionDispatchLoadInClientTx, and that service
  // must mint through ensureDriverBillArtifactsForLoad.
  assert(
    /return transitionDispatchLoadInClientTx\s*\(/.test(read("apps/backend/src/dispatch/loads.routes.ts")),
    "dispatch/loads.routes.ts transition route must delegate to transitionDispatchLoadInClientTx",
    errors,
  );
  assert(
    /ensureDriverBillArtifactsForLoad\s*\(/.test(read("apps/backend/src/dispatch/load-transition.service.ts")),
    "dispatch/load-transition.service.ts transition delivery path must call ensureDriverBillArtifactsForLoad",
    errors,
  );
  assert(
    // Repointed (ROUND 443.187): 9cb649ba1b "ACCT-F19470 (#19578)" (GO-21 B5) renamed the case — a
    // per-load rate now mints only with an explicit, logged override reason.
    bookLoadTest.includes("GO-21 B5: a typed per-load rate WITH a real override reason is used, and the override is logged"),
    "driver-bills.test.ts must cover per-load override mint",
    errors,
  );
  assert(
    /driver_pay_rate_per_mile/.test(bookModal),
    "BookLoadModalV4 must expose driver_pay_rate_per_mile",
    errors,
  );
  assert(
    /milesShortest/.test(bookModal) && /driverPayRatePerMile/.test(bookModal),
    "BookLoadModalV4 must preview driver bill from miles + rate",
    errors,
  );

  return errors;
}

function selftest() {
  // BUG FOUND LIVE (2026-09-01, verify-no-selftest-mutates-tracked-source.mjs caught it): the old
  // version called process.exit(1) from INSIDE this try block on a failing assertion.
  // process.exit() terminates the process immediately and does NOT run pending `finally` blocks
  // (unlike a throw/return), so a failing selftest left the real, money-critical
  // book-load.service.ts permanently mutated on disk instead of restored. Fixed by recording
  // failure and exiting only AFTER the finally has restored the backup, unconditionally.
  const realRel = "apps/backend/src/dispatch/book-load.service.ts";
  const backup = read(realRel);
  let failed = false;
  try {
    // Plant at the functional read (book-load.service.ts now carries the field name in a doc
    // comment ABOVE the call site, so a first-occurrence replace planted into a comment and escaped).
    PLANTED.set(realRel, backup.replace(/Number\(load\.driver_pay_rate_per_mile/, "Number(load._removed_driver_pay_rate_per_mile"));
    const planted = run();
    if (!planted.some((e) => e.includes("driver_pay_rate_per_mile"))) {
      console.error("[verify-usmca-driver-bill-per-load-rate] SELFTEST FAIL: planted override removal not detected");
      failed = true;
    } else {
      console.log(`[verify-usmca-driver-bill-per-load-rate] SELFTEST PASS (${planted.length} planted failures detected)`);
    }
    PLANTED.set(realRel, backup.replace(/milesTimesRateCents\(perLoadMiles, perLoadRateDollars \* 100\)/, "Math.round(perLoadMiles * perLoadRateDollars * 100)"));
    if (!run().some((e) => e.includes("convert per-load $/mi to cents"))) {
      console.error("[verify-usmca-driver-bill-per-load-rate] SELFTEST FAIL: planted raw-float pricing not detected");
      failed = true;
    }
    PLANTED.delete(realRel);
    const transitionRel = "apps/backend/src/dispatch/load-transition.service.ts";
    PLANTED.set(transitionRel, read(transitionRel).replace(/ensureDriverBillArtifactsForLoad\s*\(/g, "skipDriverBill("));
    if (!run().some((e) => e.includes("load-transition.service.ts"))) {
      console.error("[verify-usmca-driver-bill-per-load-rate] SELFTEST FAIL: planted transition mint removal not detected");
      failed = true;
    }
    PLANTED.delete(transitionRel);
  } finally {
    PLANTED.clear();
  }
  if (failed) process.exit(1);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    process.exit(0);
  }
  const errors = run();
  if (errors.length) {
    console.error("\n[verify-usmca-driver-bill-per-load-rate] FAILED:\n");
    for (const e of errors) console.error(`  ✗ ${e}`);
    process.exit(1);
  }
  console.log("[verify-usmca-driver-bill-per-load-rate] All checks passed ✓");
  process.exit(0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
