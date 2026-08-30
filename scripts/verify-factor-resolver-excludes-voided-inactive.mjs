#!/usr/bin/env node
/**
 * FACT-RESOLVER-03 -- getFactorForCustomer must never resolve a voided assignment or an
 * inactive/voided factor. Before this fix, the WHERE clause filtered tenant + customer +
 * effective-date range only -- a voided customer_factor_assignment row, or a factor that had
 * been deactivated or voided, still resolved and still priced real money.
 */
import { readFileSync } from "node:fs";

const SERVICE_FILE = "apps/backend/src/factoring/factor.service.ts";

function analyze(src) {
  const failures = [];
  const fnMatch = src.match(/export async function getFactorForCustomer[\s\S]*?\n}\n/);
  if (!fnMatch) {
    failures.push(`${SERVICE_FILE}: getFactorForCustomer not found`);
    return failures;
  }
  const fn = fnMatch[0];
  if (!/AND a\.voided_at IS NULL/.test(fn)) failures.push(`${SERVICE_FILE}: missing "AND a.voided_at IS NULL"`);
  if (!/AND f\.voided_at IS NULL/.test(fn)) failures.push(`${SERVICE_FILE}: missing "AND f.voided_at IS NULL"`);
  if (!/AND f\.active IS TRUE/.test(fn)) failures.push(`${SERVICE_FILE}: missing "AND f.active IS TRUE"`);
  return failures;
}

function readAll() {
  return readFileSync(SERVICE_FILE, "utf8");
}

function selftest() {
  const src = readAll();
  const good = analyze(src);
  if (good.length > 0) {
    console.error("verify-factor-resolver-excludes-voided-inactive --selftest: FAIL on the real (good) file");
    for (const f of good) console.error(`  - ${f}`);
    process.exit(1);
  }

  const mutations = [
    { name: "voided assignment check dropped", apply: (s) => s.replace("        AND a.voided_at IS NULL\n", "") },
    { name: "voided factor check dropped", apply: (s) => s.replace("        AND f.voided_at IS NULL\n", "") },
    { name: "active factor check dropped", apply: (s) => s.replace("        AND f.active IS TRUE\n", "") },
  ];

  let allCaught = true;
  for (const mut of mutations) {
    const mutated = mut.apply(src);
    if (mutated === src) {
      console.error(`verify-factor-resolver-excludes-voided-inactive --selftest: mutation had no effect -- ${mut.name}`);
      allCaught = false;
      continue;
    }
    const failures = analyze(mutated);
    if (failures.length === 0) {
      console.error(`verify-factor-resolver-excludes-voided-inactive --selftest: NOT CAUGHT -- ${mut.name}`);
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
    console.error("verify-factor-resolver-excludes-voided-inactive: FAIL");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(
    "verify-factor-resolver-excludes-voided-inactive: OK -- getFactorForCustomer excludes voided assignments, voided factors, and inactive factors"
  );
}
