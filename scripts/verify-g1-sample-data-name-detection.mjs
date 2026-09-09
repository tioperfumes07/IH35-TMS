#!/usr/bin/env node
/**
 * GO-CLOSE-188 owner G1 -- static-shape guard.
 *
 * "The TEST label must actually set is_sample_data. It does not." mdata.customers/mdata.vendors
 * accepted is_sample_data as an explicit opt-in (ACCT-F220) but nothing derived it from the name a
 * human actually typed. Live-confirmed: 17/17 word-boundary TEST/DEMO/SAMPLE customers unflagged,
 * 36/39 TEST-named vendors unflagged (owner's own count) -- feeding INV-7's growing sample-debits-
 * in-the-real-trial-balance defect. This guard confirms: (1) a single shared name-detection helper
 * exists with the word-boundary pattern (not a bare substring -- would false-positive on real names
 * like "Loves-IN471-DEMOTTE"), (2) both customers.routes.ts and vendors.routes.ts wire it into their
 * CREATE path with an explicit-caller-value-always-wins fallback, and (3) the backfill migration
 * uses the SAME pattern (kept in lockstep by construction, not convention) and is idempotent.
 *
 * EXTENDED 2026-08-31 (live gap found by CC-1): vendors.routes.ts is not the only vendor-minting
 * writer. `ensureDriverApVendor` (driver-vendor-link.service.ts) auto-provisions a driver's A/P
 * vendor from the driver's own name and had never been swept into this guard -- it minted untagged
 * vendors for TEST-named drivers with zero derivation at all, the same INV-7 sample-debit leak this
 * guard exists to close off. Now covered as a fourth required writer.
 *
 * EXTENDED 2026-09-09 (owner-ordered driver-account backfill 500'd live): the previous version of THIS
 * guard hard-required `looksLikeSampleDataName(name) || null`, which is itself a bug -- mdata.vendors.
 * is_sample_data is NOT NULL, looksLikeSampleDataName always returns a boolean, and `false || null` is
 * NULL, so every REAL-named driver's A/P vendor insert failed with 23502 and rolled back the whole
 * driver-subaccount backfill (measured live: apply -> 500 "null value in column is_sample_data ...
 * violates not-null constraint"). The derivation must stay a bare boolean. This guard now REQUIRES the
 * boolean form and FORBIDS the `|| null` (and `|| undefined`) null-collapse so the NOT-NULL insert can
 * never be re-broken the same way.
 */
import { readFileSync } from "node:fs";

const FILES = {
  helper: "apps/backend/src/mdata/sample-data-name-detection.ts",
  customers: "apps/backend/src/mdata/customers.routes.ts",
  vendors: "apps/backend/src/mdata/vendors.routes.ts",
  driverVendorLink: "apps/backend/src/accounting/driver-vendor-link.service.ts",
  migration: "db/migrations/202613291110_g1_is_sample_data_name_backfill.sql",
};

function analyze(src) {
  const failures = [];

  if (!src.helper.includes("/\\b(test|demo|sample)\\b/i")) {
    failures.push(`${FILES.helper}: word-boundary TEST/DEMO/SAMPLE pattern not found`);
  }
  if (!/export function looksLikeSampleDataName/.test(src.helper)) {
    failures.push(`${FILES.helper}: looksLikeSampleDataName is missing`);
  }

  if (!src.customers.includes('import { looksLikeSampleDataName } from "./sample-data-name-detection.js";')) {
    failures.push(`${FILES.customers}: does not import looksLikeSampleDataName`);
  }
  if (!src.customers.includes('addOptional("is_sample_data", b.is_sample_data ?? (looksLikeSampleDataName(normalizedName) || undefined));')) {
    failures.push(`${FILES.customers}: CREATE does not auto-derive is_sample_data from the name (explicit caller value must still win)`);
  }

  if (!src.vendors.includes('import { looksLikeSampleDataName } from "./sample-data-name-detection.js";')) {
    failures.push(`${FILES.vendors}: does not import looksLikeSampleDataName`);
  }
  if (!src.vendors.includes('addOptional("is_sample_data", b.is_sample_data ?? (looksLikeSampleDataName(b.name) || undefined));')) {
    failures.push(`${FILES.vendors}: CREATE does not auto-derive is_sample_data from the name (explicit caller value must still win)`);
  }

  if (!src.driverVendorLink.includes('import { looksLikeSampleDataName } from "../mdata/sample-data-name-detection.js";')) {
    failures.push(`${FILES.driverVendorLink}: does not import looksLikeSampleDataName`);
  }
  if (!src.driverVendorLink.includes("const isSampleData = looksLikeSampleDataName(name);")) {
    failures.push(`${FILES.driverVendorLink}: ensureDriverApVendor does not derive is_sample_data as a bare boolean from the driver's name`);
  }
  // NOT-NULL guard: is_sample_data is NOT NULL on mdata.vendors, so the derivation must never collapse a
  // real name's `false` into NULL/undefined. Reintroducing `|| null` / `|| undefined` here is exactly the
  // 23502 that 500'd the backfill live -- forbid it outright.
  if (/looksLikeSampleDataName\(name\)\s*\|\|\s*(null|undefined)/.test(src.driverVendorLink)) {
    failures.push(`${FILES.driverVendorLink}: is_sample_data derivation collapses false->NULL (|| null/undefined) -- violates mdata.vendors NOT NULL, 500s the insert`);
  }
  if (!src.driverVendorLink.includes("VALUES ($1::uuid, $2::text, 'Other', $3::uuid, NULL, $4)")) {
    failures.push(`${FILES.driverVendorLink}: ensureDriverApVendor's INSERT does not write the derived is_sample_data value`);
  }

  if (!src.migration.includes("customer_name ~* '\\y(test|demo|sample)\\y'")) {
    failures.push(`${FILES.migration}: customer backfill regex does not match the shared word-boundary pattern`);
  }
  if (!src.migration.includes("vendor_name ~* '\\y(test|demo|sample)\\y'")) {
    failures.push(`${FILES.migration}: vendor backfill regex does not match the shared word-boundary pattern`);
  }
  if (!src.migration.includes("WHERE COALESCE(is_sample_data, false) = false")) {
    failures.push(`${FILES.migration}: backfill is not idempotent (must skip already-true rows, never touch already-false-explicit rows twice)`);
  }

  return failures;
}

function readAll() {
  return Object.fromEntries(Object.entries(FILES).map(([key, path]) => [key, readFileSync(path, "utf8")]));
}

function selftest() {
  const src = readAll();
  const good = analyze(src);
  if (good.length > 0) {
    console.error("verify-g1-sample-data-name-detection --selftest: FAIL on the real (good) files");
    for (const f of good) console.error(`  - ${f}`);
    process.exit(1);
  }

  const mutations = [
    {
      name: "helper loses the word-boundary pattern",
      apply: (s) => ({ ...s, helper: s.helper.replace("/\\b(test|demo|sample)\\b/i", "/nope/i") }),
    },
    {
      name: "customers.routes.ts CREATE loses the auto-derive fallback (regresses to explicit-only)",
      apply: (s) => ({
        ...s,
        customers: s.customers.replace(
          'addOptional("is_sample_data", b.is_sample_data ?? (looksLikeSampleDataName(normalizedName) || undefined));',
          'addOptional("is_sample_data", b.is_sample_data);'
        ),
      }),
    },
    {
      name: "vendors.routes.ts CREATE loses the auto-derive fallback (regresses to explicit-only)",
      apply: (s) => ({
        ...s,
        vendors: s.vendors.replace(
          'addOptional("is_sample_data", b.is_sample_data ?? (looksLikeSampleDataName(b.name) || undefined));',
          'addOptional("is_sample_data", b.is_sample_data);'
        ),
      }),
    },
    {
      name: "driver-vendor-link.service.ts loses the looksLikeSampleDataName import",
      apply: (s) => ({
        ...s,
        driverVendorLink: s.driverVendorLink.replace(
          'import { looksLikeSampleDataName } from "../mdata/sample-data-name-detection.js";\n',
          ""
        ),
      }),
    },
    {
      name: "ensureDriverApVendor regresses to not deriving is_sample_data at all",
      apply: (s) => ({
        ...s,
        driverVendorLink: s.driverVendorLink
          .replace("const isSampleData = looksLikeSampleDataName(name);", "")
          .replace(
            "VALUES ($1::uuid, $2::text, 'Other', $3::uuid, NULL, $4)",
            "VALUES ($1::uuid, $2::text, 'Other', $3::uuid, NULL)"
          ),
      }),
    },
    {
      name: "ensureDriverApVendor reintroduces the `|| null` null-collapse (the live 23502 backfill 500)",
      apply: (s) => ({
        ...s,
        driverVendorLink: s.driverVendorLink.replace(
          "const isSampleData = looksLikeSampleDataName(name);",
          "const isSampleData = looksLikeSampleDataName(name) || null;"
        ),
      }),
    },
    {
      name: "migration's customer backfill regex drifts from the shared pattern",
      apply: (s) => ({ ...s, migration: s.migration.replace("customer_name ~* '\\y(test|demo|sample)\\y'", "customer_name ILIKE '%test%'") }),
    },
    {
      name: "migration loses its idempotency guard (would re-touch every row on every re-run)",
      apply: (s) => ({
        ...s,
        migration: s.migration.replaceAll("WHERE COALESCE(is_sample_data, false) = false\n   AND ", "WHERE "),
      }),
    },
  ];

  let allCaught = true;
  for (const m of mutations) {
    const mutated = m.apply(src);
    const failures = analyze(mutated);
    if (failures.length === 0) {
      console.error(`verify-g1-sample-data-name-detection --selftest: NOT CAUGHT -- ${m.name}`);
      allCaught = false;
    } else {
      console.log(`  caught: ${m.name}`);
    }
  }

  if (!allCaught) process.exit(1);
  console.log(`SELFTEST PASS: ${mutations.length}/${mutations.length} planted regressions caught.`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const src = readAll();
  const failures = analyze(src);
  if (failures.length > 0) {
    console.error("verify-g1-sample-data-name-detection: FAIL");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(
    "verify-g1-sample-data-name-detection: OK -- customers/vendors CREATE and ensureDriverApVendor auto-derive is_sample_data from a shared word-boundary name pattern, explicit caller value always wins where one exists, backfill migration uses the same pattern idempotently"
  );
}
