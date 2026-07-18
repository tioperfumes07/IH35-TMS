#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const FILES = {
  integration: "apps/frontend/src/pages/accounting/IntegrationTransactionsPage.tsx",
  invoiceModal: "apps/frontend/src/pages/accounting/InvoiceCreateModal.tsx",
  invoiceHook: "apps/frontend/src/hooks/useInvoiceCreateFromLoad.ts",
  payment: "apps/frontend/src/pages/accounting/RecordPaymentModal.tsx",
  coa: "apps/frontend/src/pages/accounting/CoaRolesPage.tsx",
  factor: "apps/frontend/src/pages/accounting/FactorReconciliationPage.tsx",
  salesTax: "apps/frontend/src/pages/accounting/SalesTaxPage.tsx",
  tests: "apps/frontend/src/pages/accounting/__tests__/AccountingQueryErrorStates.test.tsx",
};

const OFFENDERS = [
  {
    name: "IntegrationTransactionsPage txnQuery",
    file: "integration",
    visible: /txnQuery\.isError\s*\?\s*\(/,
    retry: /onRetry=\{\(\)\s*=>\s*void txnQuery\.refetch\(\)\}/,
    plantedMarker: "txnQuery.isError ? (",
  },
  {
    name: "InvoiceCreateModal loadsQuery",
    file: "invoiceModal",
    visible: /\bisError\s*\?\s*\(\s*<ListErrorBanner[\s\S]*?Failed to load invoiceable loads:/,
    retry: /onRetry=\{\(\)\s*=>\s*void refetchLoads\(\)\}/,
    plantedMarker: "isError ? (",
  },
  {
    name: "RecordPaymentModal customersQuery",
    file: "payment",
    visible: /customersQuery\.isError\s*\?\s*\(/,
    retry: /onRetry=\{\(\)\s*=>\s*void customersQuery\.refetch\(\)\}/,
    plantedMarker: "customersQuery.isError ? (",
  },
  {
    name: "RecordPaymentModal openInvoicesQuery",
    file: "payment",
    visible: /openInvoicesQuery\.isError\s*\?\s*\(/,
    retry: /onRetry=\{\(\)\s*=>\s*void openInvoicesQuery\.refetch\(\)\}/,
    plantedMarker: "openInvoicesQuery.isError ? (",
  },
  {
    name: "CoaRolesPage validateQuery",
    file: "coa",
    visible: /validateQuery\.isError\s*\?\s*\(/,
    retry: /onRetry=\{\(\)\s*=>\s*void validateQuery\.refetch\(\)\}/,
    plantedMarker: "validateQuery.isError ? (",
  },
  {
    name: "FactorReconciliationPage itemsQuery",
    file: "factor",
    visible: /itemsQuery\.isError\s*\?\s*\(/,
    retry: /onRetry=\{\(\)\s*=>\s*void itemsQuery\.refetch\(\)\}/,
    plantedMarker: "itemsQuery.isError ? (",
  },
  {
    name: "SalesTaxPage agenciesQuery",
    file: "salesTax",
    visible: /agenciesQuery\.isError\s*\?\s*\(/,
    retry: /onRetry=\{\(\)\s*=>\s*void agenciesQuery\.refetch\(\)\}/,
    plantedMarker: "agenciesQuery.isError ? (",
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
    if (!source.includes(offender.plantedMarker) || !offender.retry.test(source)) {
      failures.push(`${offender.name} must render a visible query error with its own refetch retry`);
    }
  }

  const hook = sources.invoiceHook ?? "";
  if (!/isError:\s*loadsQuery\.isError/.test(hook) || !/refetchLoads:\s*loadsQuery\.refetch/.test(hook)) {
    failures.push("useInvoiceCreateFromLoad must expose loadsQuery error state and refetch");
  }

  const invoiceModal = sources.invoiceModal ?? "";
  if (!/!isLoading\s*&&\s*!isError\s*&&\s*loads\.length\s*===\s*0/.test(invoiceModal)) {
    failures.push("InvoiceCreateModal must not show an empty-load state after a failed query");
  }

  const payment = sources.payment ?? "";
  if (!/!openInvoicesQuery\.isLoading\s*&&\s*!openInvoicesQuery\.isError\s*&&\s*openInvoices\.length\s*===\s*0/.test(payment)) {
    failures.push("RecordPaymentModal must not report zero open invoices after a failed query");
  }

  const tests = sources.tests ?? "";
  for (const queryName of ["txnQuery", "loadsQuery", "customersQuery", "openInvoicesQuery", "validateQuery", "itemsQuery", "agenciesQuery"]) {
    if (!tests.includes(queryName)) failures.push(`focused rendering/retry tests must cover ${queryName}`);
  }

  return failures;
}

export function run() {
  try {
    return check(readSources());
  } catch (error) {
    return [`could not read Wave A source: ${error instanceof Error ? error.message : String(error)}`];
  }
}

if (process.argv.includes("--selftest")) {
  const source = readSources();
  const baseline = check(source);
  const failures = [];
  if (baseline.length > 0) failures.push(`baseline failed: ${baseline.join("; ")}`);

  for (const offender of OFFENDERS) {
    const planted = { ...source };
    if (!planted[offender.file].includes(offender.plantedMarker)) {
      failures.push(`selftest marker missing for ${offender.name}`);
      continue;
    }
    planted[offender.file] = planted[offender.file].replaceAll(offender.plantedMarker, "false ? (");
    const plantedFailures = check(planted);
    if (!plantedFailures.some((failure) => failure.startsWith(offender.name))) {
      failures.push(`planted removal was not caught for ${offender.name}`);
    }
  }

  if (failures.length > 0) {
    console.error("verify:accounting-query-error-states --selftest FAIL:");
    for (const failure of failures) console.error(`  ✗ ${failure}`);
    process.exit(1);
  }
  console.log(`verify:accounting-query-error-states --selftest PASS (${OFFENDERS.length} independent planted removals caught)`);
  process.exit(0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const failures = run();
  if (failures.length > 0) {
    console.error("verify:accounting-query-error-states FAIL:");
    for (const failure of failures) console.error(`  ✗ ${failure}`);
    process.exit(1);
  }
  console.log(`verify:accounting-query-error-states PASS (${OFFENDERS.length} query failures are visible and retryable)`);
}
