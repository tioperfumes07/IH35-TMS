#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import verifyStep from "./verify-steps/908-verify-accounting-query-error-states-wave-c.mjs";
import { runStep } from "./verify-steps/_runner.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  bills: "apps/frontend/src/pages/accounting/BillsPage.tsx",
  payBill: "apps/frontend/src/pages/accounting/PayBillModal.tsx",
  ccPayment: "apps/frontend/src/pages/accounting/bill-payments/CCPaymentModal.tsx",
  paymentDetail: "apps/frontend/src/pages/accounting/PaymentDetailPage.tsx",
  paymentMethods: "apps/frontend/src/pages/accounting/PaymentMethodsCatalogPage.tsx",
  expenseMap: "apps/frontend/src/pages/accounting/ExpenseCategoryMapPage.tsx",
  reconciliation: "apps/frontend/src/pages/accounting/ReconciliationWorkspacePage.tsx",
  cashForecast: "apps/frontend/src/pages/accounting/CashForecastPage.tsx",
  tests: "apps/frontend/src/pages/accounting/__tests__/AccountingQueryErrorStatesWaveC.test.ts",
  step: "scripts/verify-steps/908-verify-accounting-query-error-states-wave-c.mjs",
};

const OFFENDERS = [
  ["BillsPage paymentsQuery", "bills", "paymentsQuery.isError", /paymentsQuery\.refetch\(\)/],
  ["BillsPage vendorsQuery", "bills", "vendorsQuery.isError", /vendorsQuery\.refetch\(\)/],
  ["PayBillModal accountsQuery", "payBill", "accountsQuery.isError", /accountsQuery\.refetch\(\)/],
  ["CCPaymentModal accountsQuery", "ccPayment", "accountsQuery.isError", /accountsQuery\.refetch\(\)/],
  ["PaymentDetailPage openInvoicesQuery", "paymentDetail", "openInvoicesQuery.isError", /openInvoicesQuery\.refetch\(\)/],
  ["PaymentMethodsCatalogPage accountsQuery", "paymentMethods", "accountsQuery.isError", /accountsQuery\.refetch\(\)/],
  ["ExpenseCategoryMapPage accountsQuery", "expenseMap", "accountsQuery.isError", /accountsQuery\.refetch\(\)/],
  ["ReconciliationWorkspacePage accountsQuery", "reconciliation", "accountsQuery.isError", /accountsQuery\.refetch\(\)/],
  ["CashForecastPage settingsQuery", "cashForecast", "settingsQuery.isError", /settingsQuery\.refetch\(\)/],
];

function readSources() {
  return Object.fromEntries(Object.entries(FILES).map(([key, file]) => [key, fs.readFileSync(path.join(ROOT, file), "utf8")]));
}

export function check(sources) {
  const failures = [];
  for (const [name, file, marker, retry] of OFFENDERS) {
    const source = sources[file] ?? "";
    if (!source.includes(marker) || !retry.test(source) || !source.includes("ListErrorBanner")) {
      failures.push(`${name} must render ListErrorBanner with its exact query refetch`);
    }
  }
  const tests = sources.tests ?? "";
  if (tests.includes("?raw")) {
    failures.push("focused tests must behaviorally render components, not inspect raw source substrings");
  }
  if (!tests.includes("renderSurface(") || !tests.includes("clickScopedRefresh(")) {
    failures.push("focused tests must render real surfaces and click their scoped Refresh controls");
  }

  const step = sources.step ?? "";
  const wiring = [
    "scripts/verify-accounting-query-error-states-wave-c.mjs",
    '"--selftest"',
    "src/pages/accounting/__tests__/AccountingQueryErrorStatesWaveC.test.ts",
    "throw new Error",
  ];
  for (const marker of wiring) {
    if (!step.includes(marker)) failures.push(`verify-step 908 must fail-closed wire ${marker}`);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const sources = readSources();
  const failures = [];
  const baseline = check(sources);
  if (baseline.length) failures.push(`baseline failed: ${baseline.join("; ")}`);
  for (const [name, file, marker] of OFFENDERS) {
    const planted = { ...sources, [file]: sources[file].replaceAll(marker, "removedQueryError") };
    if (!check(planted).some((failure) => failure.startsWith(name))) failures.push(`planted removal was not caught for ${name}`);
  }

  const plantedWiring = {
    ...sources,
    step: sources.step.replace(
      "src/pages/accounting/__tests__/AccountingQueryErrorStatesWaveC.test.ts",
      "removed-focused-test.ts",
    ),
  };
  if (!check(plantedWiring).some((failure) => failure.includes("AccountingQueryErrorStatesWaveC.test.ts"))) {
    failures.push("planted focused-test wiring removal was not caught");
  }

  for (let failingCommand = 0; failingCommand < 3; failingCommand += 1) {
    let commandIndex = 0;
    let rejected = false;
    try {
      await runStep({
        index: 1,
        total: 1,
        name: verifyStep.name,
        run: () =>
          verifyStep.run({
            run: () => {
              const status = commandIndex === failingCommand ? 37 : 0;
              commandIndex += 1;
              return status;
            },
          }),
      });
    } catch {
      rejected = true;
    }
    if (!rejected) {
      failures.push(`aggregate runner swallowed planted non-zero from verify-step command ${failingCommand + 1}`);
    }
  }

  if (failures.length) {
    console.error("verify:accounting-query-error-states-wave-c --selftest FAIL:");
    for (const failure of failures) console.error(`  ✗ ${failure}`);
    process.exit(1);
  }
  console.log(
    `verify:accounting-query-error-states-wave-c --selftest PASS (${OFFENDERS.length} independent removals, focused-test wiring, and 3 aggregate-runner failures caught)`,
  );
  process.exit(0);
}

const failures = check(readSources());
if (failures.length) {
  console.error("verify:accounting-query-error-states-wave-c FAIL:");
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}
console.log(`verify:accounting-query-error-states-wave-c PASS (${OFFENDERS.length} query failures are visible and retryable)`);
