#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  multipleBills: "apps/frontend/src/pages/accounting/CreateMultipleBillsPage.tsx",
  factoring: "apps/frontend/src/pages/accounting/SubmitFactoringModal.tsx",
  invoices: "apps/frontend/src/pages/accounting/InvoicesListPage.tsx",
  billPayments: "apps/frontend/src/pages/accounting/BillPaymentsListPage.tsx",
  recurringBill: "apps/frontend/src/pages/accounting/bills/RecurringBillCreate.tsx",
  tests: "apps/frontend/src/pages/accounting/__tests__/AccountingQueryErrorStatesWaveB.test.tsx",
};

const OFFENDERS = [
  {
    name: "CreateMultipleBillsPage vendorsQuery",
    file: "multipleBills",
    marker: "vendorsQuery.isError ? (",
    retry: /onRetry=\{\(\)\s*=>\s*void vendorsQuery\.refetch\(\)\}/,
  },
  {
    name: "CreateMultipleBillsPage coaQuery",
    file: "multipleBills",
    marker: "coaQuery.isError ? (",
    retry: /onRetry=\{\(\)\s*=>\s*void coaQuery\.refetch\(\)\}/,
  },
  {
    name: "SubmitFactoringModal vendorsQuery",
    file: "factoring",
    marker: "vendorsQuery.isError ? (",
    retry: /onRetry=\{\(\)\s*=>\s*void vendorsQuery\.refetch\(\)\}/,
  },
  {
    name: "SubmitFactoringModal invoicesQuery",
    file: "factoring",
    marker: "invoicesQuery.isError ? (",
    retry: /onRetry=\{\(\)\s*=>\s*void invoicesQuery\.refetch\(\)\}/,
  },
  {
    name: "SubmitFactoringModal factoringSummaryQuery",
    file: "factoring",
    marker: "factoringSummaryQuery.isError ? (",
    retry: /onRetry=\{\(\)\s*=>\s*void factoringSummaryQuery\.refetch\(\)\}/,
  },
  {
    name: "InvoicesListPage customersQuery",
    file: "invoices",
    marker: "customersQuery.isError ? (",
    retry: /onRetry=\{\(\)\s*=>\s*void customersQuery\.refetch\(\)\}/,
  },
  {
    name: "BillPaymentsListPage unpaidBillsQuery",
    file: "billPayments",
    marker: "unpaidBillsQuery.isError ? (",
    retry: /onRetry=\{\(\)\s*=>\s*void unpaidBillsQuery\.refetch\(\)\}/,
  },
  {
    name: "RecurringBillCreate vendorsQuery",
    file: "recurringBill",
    marker: "vendorsQuery.isError ? (",
    retry: /onRetry=\{\(\)\s*=>\s*void vendorsQuery\.refetch\(\)\}/,
  },
];

function readSources() {
  return Object.fromEntries(
    Object.entries(FILES).map(([key, relativePath]) => [key, fs.readFileSync(path.join(ROOT, relativePath), "utf8")]),
  );
}

export function check(sources) {
  const failures = [];
  for (const offender of OFFENDERS) {
    const source = sources[offender.file] ?? "";
    if (!source.includes(offender.marker) || !offender.retry.test(source)) {
      failures.push(`${offender.name} must render a scoped visible error with its own refetch retry`);
    }
  }

  const factoring = sources.factoring ?? "";
  if (!/!invoicesQuery\.isLoading\s*&&\s*!invoicesQuery\.isError\s*&&/.test(factoring)) {
    failures.push("SubmitFactoringModal must not show a false empty-invoice state after query failure");
  }

  const tests = sources.tests ?? "";
  for (const queryName of [
    "CreateMultipleBillsPage vendorsQuery",
    "CreateMultipleBillsPage coaQuery",
    "SubmitFactoringModal vendorsQuery",
    "SubmitFactoringModal invoicesQuery",
    "SubmitFactoringModal factoringSummaryQuery",
    "InvoicesListPage customersQuery",
    "BillPaymentsListPage unpaidBillsQuery",
    "RecurringBillCreate vendorsQuery",
  ]) {
    const [surface, query] = queryName.split(" ");
    if (!tests.includes(surface) || !tests.includes(query)) {
      failures.push(`focused rendering/retry tests must cover ${queryName}`);
    }
  }
  return failures;
}

export function run() {
  try {
    return check(readSources());
  } catch (error) {
    return [`could not read Wave B source: ${error instanceof Error ? error.message : String(error)}`];
  }
}

if (process.argv.includes("--selftest")) {
  const sources = readSources();
  const failures = [];
  const baseline = check(sources);
  if (baseline.length > 0) failures.push(`baseline failed: ${baseline.join("; ")}`);

  for (const offender of OFFENDERS) {
    const planted = { ...sources };
    if (!planted[offender.file].includes(offender.marker)) {
      failures.push(`selftest marker missing for ${offender.name}`);
      continue;
    }
    planted[offender.file] = planted[offender.file].replaceAll(offender.marker, "false ? (");
    if (!check(planted).some((failure) => failure.startsWith(offender.name))) {
      failures.push(`planted removal was not caught for ${offender.name}`);
    }
  }

  if (failures.length > 0) {
    console.error("verify:accounting-query-error-states-wave-b --selftest FAIL:");
    for (const failure of failures) console.error(`  ✗ ${failure}`);
    process.exit(1);
  }
  console.log(`verify:accounting-query-error-states-wave-b --selftest PASS (${OFFENDERS.length} independent planted removals caught)`);
  process.exit(0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const failures = run();
  if (failures.length > 0) {
    console.error("verify:accounting-query-error-states-wave-b FAIL:");
    for (const failure of failures) console.error(`  ✗ ${failure}`);
    process.exit(1);
  }
  console.log(`verify:accounting-query-error-states-wave-b PASS (${OFFENDERS.length} query failures are visible and retryable)`);
}
