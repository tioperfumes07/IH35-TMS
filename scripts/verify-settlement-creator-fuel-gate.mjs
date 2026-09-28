#!/usr/bin/env node
/**
 * ROUND 190/191 (2026-09-28) — real root cause of the 2026-09-24 fuel-feed gap: Settlement
 * Creator (settlement-creator.service.ts) DOES seed fuel.fuel_transactions from
 * draft.fuel_purchases, but nothing ever verified the caller actually populated it from the
 * signed PDF. 5817/5818/5819 all posted with a period_end past the company's fuel-transaction
 * frontier at the time and zero fuel_purchases declared. This guard asserts the preview blocker
 * that now catches that case is still present: `previewSettlementCreator` refuses to post a
 * settlement whose period_end extends past the entity's latest known fuel_transactions row while
 * fuel_purchases is empty, unless the caller explicitly sets `confirmed_zero_fuel_purchases`.
 *
 * Static only — a live rollback-wrapped proof of this exact gate already ran this round (see
 * PR history); this guard exists to catch a future regression of the SOURCE PATTERN, not to
 * re-run the live proof every push.
 *
 * Run: node scripts/verify-settlement-creator-fuel-gate.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SVC = "apps/backend/src/driver-finance/settlement-creator.service.ts";
const TYPES = "apps/backend/src/driver-finance/settlement-creator.types.ts";
const LABEL = "verify-settlement-creator-fuel-gate";

export function checkStaticSource(svcSrc, typesSrc) {
  const problems = [];
  if (!/confirmed_zero_fuel_purchases/.test(typesSrc)) {
    problems.push(`${TYPES}: confirmed_zero_fuel_purchases field missing from SettlementCreatorDraft`);
  }
  if (!/draft\.fuel_purchases\?\.length\s*&&\s*!draft\.confirmed_zero_fuel_purchases/.test(svcSrc) &&
      !/!draft\.fuel_purchases\?\.length\s*&&\s*!draft\.confirmed_zero_fuel_purchases/.test(svcSrc)) {
    problems.push(`${SVC}: the fuel-gate condition (empty fuel_purchases AND not confirmed_zero_fuel_purchases) not found`);
  }
  if (!/MAX\(transaction_at\)/.test(svcSrc)) {
    problems.push(`${SVC}: no MAX(transaction_at) frontier check against fuel.fuel_transactions found`);
  }
  if (!/blockers\.push/.test(svcSrc.slice(svcSrc.indexOf("confirmed_zero_fuel_purchases") - 200, svcSrc.indexOf("confirmed_zero_fuel_purchases") + 1500))) {
    problems.push(`${SVC}: no blockers.push(...) found near the fuel-gate check -- it must actually block, not just warn`);
  }
  return problems;
}

export function checkStatic(root = ROOT) {
  let svcSrc;
  let typesSrc;
  try {
    svcSrc = fs.readFileSync(path.join(root, SVC), "utf8");
    typesSrc = fs.readFileSync(path.join(root, TYPES), "utf8");
  } catch {
    return [`${SVC} or ${TYPES}: missing`];
  }
  return checkStaticSource(svcSrc, typesSrc);
}

export function runSelftest() {
  const goodSvc = `
    if (!draft.fuel_purchases?.length && !draft.confirmed_zero_fuel_purchases) {
      const frontier = await client.query(\`SELECT MAX(transaction_at)::text AS max_at FROM fuel.fuel_transactions WHERE operating_company_id = $1::uuid\`, [draft.operating_company_id]);
      if (!maxAt || draft.period_end > maxAt) {
        blockers.push("period extends past frontier with no fuel_purchases declared");
      }
    }
  `;
  const goodTypes = `confirmed_zero_fuel_purchases?: boolean;`;

  const cases = [
    { name: "correct source", svc: goodSvc, types: goodTypes, expectFail: false },
    { name: "missing type field", svc: goodSvc, types: "no such field", expectFail: true },
    { name: "missing gate condition", svc: "no gate here at all", types: goodTypes, expectFail: true },
    { name: "missing frontier check", svc: goodSvc.replace("MAX(transaction_at)", "SOMETHING_ELSE"), types: goodTypes, expectFail: true },
  ];
  let failures = 0;
  for (const c of cases) {
    const problems = checkStaticSource(c.svc, c.types);
    const gotFail = problems.length > 0;
    if (gotFail !== c.expectFail) {
      failures += 1;
      console.error(`  SELFTEST FAIL: "${c.name}" expected fail=${c.expectFail}, got fail=${gotFail} (${JSON.stringify(problems)})`);
    }
  }
  if (failures > 0) {
    console.error(`${LABEL} --selftest FAIL (${failures} case(s))`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS ${cases.length}/${cases.length}`);
}

function main() {
  const problems = checkStatic();
  if (problems.length > 0) {
    console.error(`${LABEL} FAIL:`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} PASS: Settlement Creator refuses to post a period-extending settlement with undeclared fuel purchases.`);
}

if (process.argv.includes("--selftest")) {
  runSelftest();
} else {
  main();
}
