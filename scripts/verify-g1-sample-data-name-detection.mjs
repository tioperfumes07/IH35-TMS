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
 */
import { readFileSync } from "node:fs";

const FILES = {
  helper: "apps/backend/src/mdata/sample-data-name-detection.ts",
  customers: "apps/backend/src/mdata/customers.routes.ts",
  vendors: "apps/backend/src/mdata/vendors.routes.ts",
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
    "verify-g1-sample-data-name-detection: OK -- customers/vendors CREATE auto-derive is_sample_data from a shared word-boundary name pattern, explicit caller value always wins, backfill migration uses the same pattern idempotently"
  );
}
