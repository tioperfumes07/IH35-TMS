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

function read(rel) {
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
    /load\.driver_pay_rate_per_mile/.test(bookLoad),
    "book-load.service.ts must read load.driver_pay_rate_per_mile",
    errors,
  );
  assert(
    /load\.miles_shortest/.test(bookLoad),
    "book-load.service.ts must read load.miles_shortest",
    errors,
  );
  assert(
    /Math\.round\(perLoadRateDollars \* 100 \* perLoadMiles\)/.test(bookLoad),
    "book-load.service.ts must convert per-load $/mi to cents",
    errors,
  );
  assert(
    /createDriverBillArtifacts\s*\(/.test(bookLoad),
    "book-load.service.ts must call createDriverBillArtifacts",
    errors,
  );
  assert(
    /ensureDriverBillArtifactsForLoad\s*\(/.test(read("apps/backend/src/dispatch/loads.routes.ts")),
    "dispatch/loads.routes.ts transition delivery path must call ensureDriverBillArtifactsForLoad",
    errors,
  );
  assert(
    bookLoadTest.includes("uses the per-load driver_pay_rate_per_mile override"),
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
  const realPath = path.join(ROOT, "apps/backend/src/dispatch/book-load.service.ts");
  const backup = fs.readFileSync(realPath, "utf8");
  try {
    fs.writeFileSync(
      realPath,
      backup.replace(/load\.driver_pay_rate_per_mile/, "load._removed_driver_pay_rate_per_mile"),
      "utf8",
    );
    const planted = run();
    if (!planted.some((e) => e.includes("driver_pay_rate_per_mile"))) {
      console.error("[verify-usmca-driver-bill-per-load-rate] SELFTEST FAIL: planted override removal not detected");
      process.exit(1);
    }
    console.log(`[verify-usmca-driver-bill-per-load-rate] SELFTEST PASS (${planted.length} planted failures detected)`);
  } finally {
    fs.writeFileSync(realPath, backup, "utf8");
  }
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
