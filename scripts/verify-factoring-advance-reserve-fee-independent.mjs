#!/usr/bin/env node
/**
 * FACT-RESERVE-01 (GO-FARO-02 REV B) -- static-shape guard.
 *
 * POST /api/v1/accounting/factoring-advances computed reserve_amount_cents as "invoiceTotal -
 * advanceAmount" -- the ENTIRE holdback, ignoring the caller-supplied reserve_pct entirely -- and
 * never wrote factor_fee_cents at all (not even in the INSERT column list), so every factoring
 * advance's fee expense silently posted as $0 while reserve was overstated by that same amount.
 * Balanced (the invoice total still reconciled) but wrong: the factor's actual financing fee never
 * reached the GL. Confirmed live: FAC-2026-00001 reserve_amount_cents=5550, factor_fee_cents=0.
 *
 * This guard confirms the fix: reserve and fee are each computed independently from their own
 * caller-supplied percentage (round(total * pct / 100)), matching the packet's own prescribed
 * formula, and factor_fee_cents is a real INSERT column -- not a change to advance_amount_cents
 * (the cash actually funded), only to how the remaining holdback is classified.
 */
import { readFileSync } from "node:fs";

const ROUTES_FILE = "apps/backend/src/accounting/factoring-advances.routes.ts";

function analyze(src) {
  const failures = [];

  if (!/const reserveAmount = Math\.round\(\(invoiceTotalCents \* Number\(body\.data\.reserve_pct\)\) \/ 100\);/.test(src)) {
    failures.push(`${ROUTES_FILE}: reserveAmount is not computed independently from reserve_pct`);
  }
  if (!/const feeAmount = Math\.round\(\(invoiceTotalCents \* Number\(body\.data\.factor_fee_pct \?\? 0\)\) \/ 100\);/.test(src)) {
    failures.push(`${ROUTES_FILE}: feeAmount is not computed independently from factor_fee_pct`);
  }
  // The old bug's exact shape must never come back.
  if (/const reserveAmount = Math\.max\(0, invoiceTotalCents - advanceAmount\);/.test(src)) {
    failures.push(`${ROUTES_FILE}: reserveAmount has reverted to the old "whatever's left after advance" formula`);
  }
  // factor_fee_cents must be a real INSERT column on the create route (not just read elsewhere).
  const createInsertMatch = src.match(/INSERT INTO accounting\.factoring_advances \(([\s\S]*?)\)\s*\n\s*VALUES/);
  if (!createInsertMatch || !/factor_fee_cents/.test(createInsertMatch[1])) {
    failures.push(`${ROUTES_FILE}: factor_fee_cents is missing from the factoring_advances INSERT column list`);
  }
  if (!/feeAmount,\s*\n\s*body\.data\.notes/.test(src)) {
    failures.push(`${ROUTES_FILE}: feeAmount is not bound as a parameter to the INSERT`);
  }

  return failures;
}

function readAll() {
  return readFileSync(ROUTES_FILE, "utf8");
}

function selftest() {
  const src = readAll();
  const good = analyze(src);
  if (good.length > 0) {
    console.error("verify-factoring-advance-reserve-fee-independent --selftest: FAIL on the real (good) file");
    for (const f of good) console.error(`  - ${f}`);
    process.exit(1);
  }

  const mutations = [
    {
      name: "reserveAmount reverts to invoiceTotal - advanceAmount",
      apply: (s) =>
        s.replace(
          "const reserveAmount = Math.round((invoiceTotalCents * Number(body.data.reserve_pct)) / 100);",
          "const reserveAmount = Math.max(0, invoiceTotalCents - advanceAmount);"
        ),
    },
    {
      name: "feeAmount computation deleted",
      apply: (s) => s.replace("const feeAmount = Math.round((invoiceTotalCents * Number(body.data.factor_fee_pct ?? 0)) / 100);\n", ""),
    },
    {
      name: "factor_fee_cents dropped from the INSERT column list",
      apply: (s) => s.replace(/(\s*)factor_fee_cents,(\s*\n\s*notes,)/, "$1$2"),
    },
    {
      name: "feeAmount no longer bound as an INSERT parameter",
      apply: (s) => s.replace("          feeAmount,\n          body.data.notes ?? null,", "          body.data.notes ?? null,"),
    },
  ];

  let allCaught = true;
  for (const mut of mutations) {
    const mutated = mut.apply(src);
    if (mutated === src) {
      console.error(`verify-factoring-advance-reserve-fee-independent --selftest: mutation had no effect -- ${mut.name}`);
      allCaught = false;
      continue;
    }
    const failures = analyze(mutated);
    if (failures.length === 0) {
      console.error(`verify-factoring-advance-reserve-fee-independent --selftest: NOT CAUGHT -- ${mut.name}`);
      allCaught = false;
    } else {
      console.log(`  caught: ${mut.name}`);
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
    console.error("verify-factoring-advance-reserve-fee-independent: FAIL");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(
    "verify-factoring-advance-reserve-fee-independent: OK -- reserve and fee are each computed independently from their own percentage, factor_fee_cents is a real INSERT column"
  );
}
