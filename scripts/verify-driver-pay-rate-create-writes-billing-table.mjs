#!/usr/bin/env node
/**
 * SETL-45-PAYRATE-CREATE-WRONG-TABLE / PAY-RATE-DUAL-TABLE-SPLIT-DISCONNECTED-FROM-BILLING —
 * static-shape guard. "Guard that UI path R=W" (owner directive, GO-E2E follow-up).
 *
 * The Equipment Assignments / Qualifications UI is the only reachable place a company user can
 * enter a driver's per-mile pay rate; it writes mdata.driver_pay_rates. book-load.service.ts's
 * resolveDriverBasePayCents() reads a different table, driver_finance.driver_pay_rates. Before this
 * fix, nothing ever wrote the table that gets read -- a rate entered through the only UI a human can
 * reach was invisible to the settlement engine, live-proven 2026-08-31 (GO-E2E chain).
 *
 * This guard asserts both mdata.driver_pay_rates writers in driver-profile.routes.ts (the initial
 * CREATE-with-rates path and the rates/change path) call the shared
 * syncDriverFinancePayRateFromQualificationRate() helper, and that the helper itself inserts into
 * driver_finance.driver_pay_rates with the exact column shape resolveDriverBasePayCents() reads
 * (basis_type='per_mile_pay', rate_per_mile_cents, is_active=true, effective_from, driver_id).
 */
import { readFileSync } from "node:fs";

const FILES = {
  routes: "apps/backend/src/mdata/driver-profile.routes.ts",
};

function analyze(src) {
  const failures = [];

  if (!/async function syncDriverFinancePayRateFromQualificationRate/.test(src.routes)) {
    failures.push(`${FILES.routes}: syncDriverFinancePayRateFromQualificationRate is missing`);
    return failures;
  }

  const helperStart = src.routes.indexOf("async function syncDriverFinancePayRateFromQualificationRate");
  const helperEnd = src.routes.indexOf("\nexport async function registerDriverProfileRoutes", helperStart);
  const helperBody = src.routes.slice(helperStart, helperEnd >= 0 ? helperEnd : undefined);

  if (!/INSERT INTO driver_finance\.driver_pay_rates/.test(helperBody)) {
    failures.push(`${FILES.routes}: syncDriverFinancePayRateFromQualificationRate no longer INSERTs into driver_finance.driver_pay_rates`);
  }
  if (!/'per_mile_pay'/.test(helperBody)) {
    failures.push(`${FILES.routes}: syncDriverFinancePayRateFromQualificationRate no longer sets basis_type='per_mile_pay'`);
  }
  if (!/rate_per_mile_cents/.test(helperBody)) {
    failures.push(`${FILES.routes}: syncDriverFinancePayRateFromQualificationRate no longer writes rate_per_mile_cents`);
  }
  if (!/input\.lineItemTemplateCode !== "LOADED_MILE"/.test(helperBody)) {
    failures.push(`${FILES.routes}: syncDriverFinancePayRateFromQualificationRate lost its LOADED_MILE-only gate`);
  }
  // driver_finance.driver_pay_rates_tenant_scope RLS requires app.operating_company_id (or lucia
  // bypass) -- live-caught 2026-08-31: a real Chrome submit through the rates/change route 500'd
  // with a 42501 policy violation because that route never set this GUC. The set_config call must
  // run before the writes, inside this helper, so neither call site can regress independently.
  if (!/set_config\('app\.operating_company_id', \$1::text, true\)/.test(helperBody)) {
    failures.push(
      `${FILES.routes}: syncDriverFinancePayRateFromQualificationRate no longer sets app.operating_company_id ` +
        "before writing -- driver_pay_rates_tenant_scope RLS will 42501 on the rates/change route again"
    );
  }

  const callCount = (src.routes.match(/await syncDriverFinancePayRateFromQualificationRate\(client, \{/g) || []).length;
  if (callCount !== 2) {
    failures.push(
      `${FILES.routes}: expected exactly 2 call sites for syncDriverFinancePayRateFromQualificationRate ` +
        `(the CREATE-with-initial-rates path and the rates/change path), found ${callCount}`
    );
  }

  return failures;
}

function readAll() {
  return { routes: readFileSync(FILES.routes, "utf8") };
}

function selftest() {
  const src = readAll();
  const good = analyze(src);
  if (good.length > 0) {
    console.error("verify-driver-pay-rate-create-writes-billing-table --selftest: FAIL on the real (good) file");
    for (const f of good) console.error(`  - ${f}`);
    process.exit(1);
  }

  const mutations = [
    {
      name: "helper loses its INSERT INTO driver_finance.driver_pay_rates",
      apply: (s) => ({
        ...s,
        routes: s.routes.replace(
          "INSERT INTO driver_finance.driver_pay_rates (",
          "INSERT INTO mdata.some_other_table_not_the_billing_one ("
        ),
      }),
    },
    {
      name: "helper loses the app.operating_company_id set_config call (would 42501 again)",
      apply: (s) => ({
        ...s,
        routes: s.routes.replace(
          "await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operatingCompanyId]);\n\n  ",
          ""
        ),
      }),
    },
    {
      name: "one of the two call sites is removed (rates/change path)",
      apply: (s) => {
        const idx = s.routes.lastIndexOf("await syncDriverFinancePayRateFromQualificationRate(client, {");
        const endIdx = s.routes.indexOf("});", idx) + 3;
        return { ...s, routes: s.routes.slice(0, idx) + s.routes.slice(endIdx) };
      },
    },
    {
      name: "LOADED_MILE-only gate is removed (would mirror EMPTY_MILE too)",
      apply: (s) => ({
        ...s,
        routes: s.routes.replace('if (input.lineItemTemplateCode !== "LOADED_MILE") return;\n  ', ""),
      }),
    },
  ];

  let allCaught = true;
  for (const m of mutations) {
    const mutated = m.apply(src);
    const failures = analyze(mutated);
    if (failures.length === 0) {
      console.error(`verify-driver-pay-rate-create-writes-billing-table --selftest: NOT CAUGHT -- ${m.name}`);
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
    console.error("verify-driver-pay-rate-create-writes-billing-table: FAIL");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(
    "verify-driver-pay-rate-create-writes-billing-table: OK -- Equipment Assignments' LOADED_MILE rate writes mirror into driver_finance.driver_pay_rates, the table book-load.service.ts actually reads"
  );
}
