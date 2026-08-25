#!/usr/bin/env node
/**
 * GUARD (ACCT-ECON-05): the vendor credit path stays EXECUTABLE, not merely present.
 *
 * Regression this locks out — the reason accounting.vendor_credits is empty on prod:
 *   - `accounting.bills.vendor_id` carries the QBO vendor id on 16211 of 16212 prod bills while a
 *     vendor credit carries an `mdata.vendors.id` uuid, so a raw equality filter returned zero
 *     bills and no credit could ever be applied. Both sides must go through vendor-identity.ts.
 *   - the apply route must refuse a bill that belongs to a different vendor.
 *   - create must not silently drop a designated GL account, and must number credits with the
 *     canonical advisory-locked generator (a private COUNT(*)+1 collided under concurrency).
 *   - the lifecycle must stay covered by the real-Postgres integration suite, or "the path works"
 *     becomes an unproven claim again.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-vendor-credit-live-path";
const SELFTEST = process.argv.includes("--selftest");

const ROUTES = "apps/backend/src/accounting/vendor-credits.routes.ts";
const BILLS_SERVICE = "apps/backend/src/accounting/bills.service.ts";
const IDENTITY = "apps/backend/src/accounting/vendor-identity.ts";
const INDEX = "apps/backend/src/index.ts";
const SUITE = "apps/backend/src/accounting/__tests__/vendor-credits.integration.test.ts";

/** Every check is `${file} must contain ${needle}` so a planted deletion fails loudly. */
const REQUIRED = [
  [IDENTITY, "vendorIdentitySetSql", "canonical mdata↔QBO vendor bridge (SQL form)"],
  [IDENTITY, "resolveVendorIdentitySet", "canonical mdata↔QBO vendor bridge (runtime form)"],
  [IDENTITY, "operating_company_id = $", "vendor identity resolution must stay entity-scoped"],
  [BILLS_SERVICE, "vendorIdentitySetSql(1, 2)", "listBillsByVendor must resolve both vendor identity spaces"],
  [ROUTES, "resolveVendorIdentitySet", "apply must resolve the credit vendor's identity set"],
  [ROUTES, "bill_vendor_mismatch", "apply must refuse another vendor's bill"],
  [ROUTES, "over_apply_refused", "apply must refuse more than the unapplied credit"],
  [ROUTES, "applied_cents_exceeds_bill_balance", "apply must refuse more than the bill balance"],
  [ROUTES, "coa_account_id_not_persisted", "create must refuse a GL account it cannot persist"],
  [ROUTES, "nextVendorCreditDisplayId", "create must use the canonical display-id generator"],
  [ROUTES, 'app.get("/api/v1/accounting/vendor-credits/next-number"', "create chrome must preview the same generator"],
  [INDEX, "registerVendorCreditsRoutes", "vendor credit routes must stay mounted"],
  [SUITE, "createIsolatedOperatingCompany", "lifecycle proof must run against real Postgres"],
  [SUITE, "lists the vendor's QBO-keyed bills", "proof that the mdata↔QBO bridge resolves bills"],
  [SUITE, "refuses to settle another vendor's bill", "proof that cross-vendor apply is refused"],
  [SUITE, "voids a credit and reverses its applications", "proof that void reverses, never deletes"],
];

/** Patterns that must NOT come back. */
const FORBIDDEN = [
  [
    BILLS_SERVICE,
    "COALESCE(NULLIF(b.vendor_id,''), NULLIF(b.vendor_uuid,'')) = $2",
    "raw vendor equality returns zero bills for QBO-keyed A/P",
  ],
  [ROUTES, "COUNT(*)::int + 1 AS seq", "unlocked display-id sequence collides under concurrency"],
];

export function collectProblems(read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8")) {
  const problems = [];
  const cache = new Map();
  const load = (rel) => {
    if (!cache.has(rel)) {
      try {
        cache.set(rel, read(rel));
      } catch {
        cache.set(rel, null);
      }
    }
    return cache.get(rel);
  };

  for (const rel of [ROUTES, BILLS_SERVICE, IDENTITY, INDEX, SUITE]) {
    if (load(rel) === null) problems.push(`${rel}:1 missing`);
  }
  for (const [rel, needle, why] of REQUIRED) {
    const text = load(rel);
    if (text !== null && !text.includes(needle)) problems.push(`${rel}:1 missing "${needle}" — ${why}`);
  }
  for (const [rel, needle, why] of FORBIDDEN) {
    const text = load(rel);
    if (text !== null && text.includes(needle)) problems.push(`${rel}:1 reintroduced "${needle}" — ${why}`);
  }
  return problems;
}

if (SELFTEST) {
  const failures = [];
  const blank = collectProblems(() => "");
  if (!blank.some((p) => p.includes("bill_vendor_mismatch"))) {
    failures.push("selftest: emptied sources did not trip the cross-vendor check");
  }
  if (!blank.some((p) => p.includes("vendorIdentitySetSql(1, 2)"))) {
    failures.push("selftest: emptied sources did not trip the vendor identity bridge check");
  }
  const regressed = collectProblems((rel) =>
    rel === BILLS_SERVICE
      ? "COALESCE(NULLIF(b.vendor_id,''), NULLIF(b.vendor_uuid,'')) = $2"
      : fs.readFileSync(path.join(ROOT, rel), "utf8")
  );
  if (!regressed.some((p) => p.includes("reintroduced"))) {
    failures.push("selftest: restored raw vendor equality was not caught");
  }
  if (failures.length) {
    console.error(`${LABEL} --selftest FAIL`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest: PASS`);
  process.exit(0);
}

const problems = collectProblems();
if (problems.length) {
  console.error(`${LABEL}: FAIL`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS`);
