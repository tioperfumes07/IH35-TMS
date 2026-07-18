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
    testTitle: "renders and retries CreateMultipleBillsPage vendorsQuery without a coaQuery error",
    testAssertions: [
      'render(<CreateMultipleBillsPage />);',
      'expect(screen.queryByText(/Failed to load A\\/P accounts for bill rows:/)).not.toBeInTheDocument();',
      'expectVisibleRetry(/Failed to load vendors for bill rows: vendors unavailable/, failed);',
    ],
  },
  {
    name: "CreateMultipleBillsPage coaQuery",
    file: "multipleBills",
    marker: "coaQuery.isError ? (",
    retry: /onRetry=\{\(\)\s*=>\s*void coaQuery\.refetch\(\)\}/,
    testTitle: "renders and retries CreateMultipleBillsPage coaQuery without a vendorsQuery error",
    testAssertions: [
      'render(<CreateMultipleBillsPage />);',
      'expect(screen.queryByText(/Failed to load vendors for bill rows:/)).not.toBeInTheDocument();',
      'expectVisibleRetry(/Failed to load A\\/P accounts for bill rows: accounts unavailable/, failed);',
    ],
  },
  {
    name: "SubmitFactoringModal vendorsQuery",
    file: "factoring",
    marker: "vendorsQuery.isError ? (",
    retry: /onRetry=\{\(\)\s*=>\s*void vendorsQuery\.refetch\(\)\}/,
    testTitle: "renders and retries SubmitFactoringModal vendorsQuery without co-query errors",
    testAssertions: [
      'render(<SubmitFactoringModal open operatingCompanyId="company-1" onClose={vi.fn()} onCreated={vi.fn()} />);',
      'expect(screen.queryByText(/Failed to load eligible invoices:/)).not.toBeInTheDocument();',
      'expect(screen.queryByText(/Failed to load factoring defaults:/)).not.toBeInTheDocument();',
      'expectVisibleRetry(/Failed to load factoring companies: vendors unavailable/, failed);',
    ],
  },
  {
    name: "SubmitFactoringModal invoicesQuery",
    file: "factoring",
    marker: "invoicesQuery.isError ? (",
    retry: /onRetry=\{\(\)\s*=>\s*void invoicesQuery\.refetch\(\)\}/,
    testTitle: "renders and retries SubmitFactoringModal invoicesQuery without co-query errors",
    testAssertions: [
      'render(<SubmitFactoringModal open operatingCompanyId="company-1" onClose={vi.fn()} onCreated={vi.fn()} />);',
      'expect(screen.queryByText(/Failed to load factoring companies:/)).not.toBeInTheDocument();',
      'expect(screen.queryByText(/Failed to load factoring defaults:/)).not.toBeInTheDocument();',
      'expectVisibleRetry(/Failed to load eligible invoices: invoices unavailable/, failed);',
    ],
  },
  {
    name: "SubmitFactoringModal factoringSummaryQuery",
    file: "factoring",
    marker: "factoringSummaryQuery.isError ? (",
    retry: /onRetry=\{\(\)\s*=>\s*void factoringSummaryQuery\.refetch\(\)\}/,
    testTitle: "renders and retries SubmitFactoringModal factoringSummaryQuery without co-query errors",
    testAssertions: [
      'render(<SubmitFactoringModal open operatingCompanyId="company-1" onClose={vi.fn()} onCreated={vi.fn()} />);',
      'expect(screen.queryByText(/Failed to load factoring companies:/)).not.toBeInTheDocument();',
      'expect(screen.queryByText(/Failed to load eligible invoices:/)).not.toBeInTheDocument();',
      'expectVisibleRetry(/Failed to load factoring defaults: summary unavailable/, failed);',
    ],
  },
  {
    name: "InvoicesListPage customersQuery",
    file: "invoices",
    marker: "customersQuery.isError ? (",
    retry: /onRetry=\{\(\)\s*=>\s*void customersQuery\.refetch\(\)\}/,
    testTitle: "renders and retries InvoicesListPage customersQuery without an invoices query error",
    testAssertions: [
      'render(<InvoicesListPage />);',
      'expect(screen.queryByText("Failed to load. Try refreshing.")).not.toBeInTheDocument();',
      'expectVisibleRetry(/Failed to load customer filters: customers unavailable/, failed);',
    ],
  },
  {
    name: "BillPaymentsListPage unpaidBillsQuery",
    file: "billPayments",
    marker: "unpaidBillsQuery.isError ? (",
    retry: /onRetry=\{\(\)\s*=>\s*void unpaidBillsQuery\.refetch\(\)\}/,
    testTitle: "renders and retries BillPaymentsListPage unpaidBillsQuery without a payments query error",
    testAssertions: [
      'render(<BillPaymentsListPage />);',
      'expect(screen.queryByText("Failed to load. Try refreshing.")).not.toBeInTheDocument();',
      'expectVisibleRetry(/Failed to load unpaid bills: unpaid bills unavailable/, failed);',
    ],
  },
  {
    name: "RecurringBillCreate vendorsQuery",
    file: "recurringBill",
    marker: "vendorsQuery.isError ? (",
    retry: /onRetry=\{\(\)\s*=>\s*void vendorsQuery\.refetch\(\)\}/,
    testTitle: "renders and retries RecurringBillCreate vendorsQuery",
    testAssertions: [
      'render(<RecurringBillCreate />);',
      'expectVisibleRetry(/Failed to load recurring-bill vendors: vendors unavailable/, failed);',
    ],
  },
];

function readSources() {
  return Object.fromEntries(
    Object.entries(FILES).map(([key, relativePath]) => [key, fs.readFileSync(path.join(ROOT, relativePath), "utf8")]),
  );
}

export function check(sources) {
  const failures = [];
  const tests = sources.tests ?? "";
  for (const offender of OFFENDERS) {
    const source = sources[offender.file] ?? "";
    if (!source.includes(offender.marker) || !offender.retry.test(source)) {
      failures.push(`${offender.name} must render a scoped visible error with its own refetch retry`);
    }
    const testMarker = `it("${offender.testTitle}", () => {`;
    const testStart = tests.indexOf(testMarker);
    const nextTestStart = testStart < 0 ? -1 : tests.indexOf("\n  it(", testStart + testMarker.length);
    const testBody = testStart < 0 ? "" : tests.slice(testStart, nextTestStart < 0 ? tests.length : nextTestStart);
    if (testStart < 0 || offender.testAssertions.some((assertion) => !testBody.includes(assertion))) {
      failures.push(`${offender.name} focused test must render its surface, exclude co-query errors, click its retry, and assert its refetch`);
    }
  }

  const factoring = sources.factoring ?? "";
  if (!/!invoicesQuery\.isLoading\s*&&\s*!invoicesQuery\.isError\s*&&/.test(factoring)) {
    failures.push("SubmitFactoringModal must not show a false empty-invoice state after query failure");
  }

  if (
    !/function expectVisibleRetry\(message: RegExp, query: QueryResult\)[\s\S]*screen\.getByText\(message\)[\s\S]*querySelector\("button"\)[\s\S]*fireEvent\.click\(retry!\)[\s\S]*expect\(query\.refetch\)\.toHaveBeenCalledOnce\(\)/.test(
      tests,
    )
  ) {
    failures.push("focused retry helper must find the intended banner, click its exact retry, and assert the matching query refetch");
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

  for (const offender of OFFENDERS) {
    const planted = { ...sources };
    const retryAssertion = offender.testAssertions.at(-1);
    if (!retryAssertion || !planted.tests.includes(retryAssertion)) {
      failures.push(`selftest focused-test assertion missing for ${offender.name}`);
      continue;
    }
    planted.tests = planted.tests.replace(retryAssertion, "// planted focused-test assertion removal");
    if (!check(planted).some((failure) => failure.startsWith(`${offender.name} focused test`))) {
      failures.push(`planted focused-test removal was not caught for ${offender.name}`);
    }
  }

  if (failures.length > 0) {
    console.error("verify:accounting-query-error-states-wave-b --selftest FAIL:");
    for (const failure of failures) console.error(`  ✗ ${failure}`);
    process.exit(1);
  }
  console.log(
    `verify:accounting-query-error-states-wave-b --selftest PASS (${OFFENDERS.length} surface + ${OFFENDERS.length} focused-test removals caught independently)`,
  );
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
