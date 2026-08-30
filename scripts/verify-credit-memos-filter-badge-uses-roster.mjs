#!/usr/bin/env node
// CREDIT-MEMOS-FILTER-BADGE-FALSE-NOT-VISIBLE: CreditMemosPage's customer filter-badge derived its
// label ONLY from creditMemosQuery's (already customer-filtered) data, so any customer with zero
// credit memos -- the common case -- rendered as "Customer — not visible", a phrase entity-label.ts
// reserves for a genuine RLS/deactivation signal. Confirmed live on prod (tiny-field-89581227): only
// 2 distinct customers have ever had a credit memo issued, so filtering to any other real customer
// hit this false negative. Fix: check customerOptions (the full, unfiltered roster from
// listAllCustomers) first. Guard requires the roster lookup to run before the credit-memos fallback.
import fs from "node:fs";

const FILE = "apps/frontend/src/pages/accounting/CreditMemosPage.tsx";

function inspect(source) {
  const failures = [];

  const match = source.match(
    /const filterCustomerName = useMemo\(\(\) => \{[\s\S]*?\}, \[customerOptions, creditMemosQuery\.data\?\.credit_memos, customerFilter\]\);/,
  );
  if (!match) {
    failures.push("filterCustomerName useMemo not found with customerOptions in its dependency array");
    return failures;
  }
  const body = match[0];
  if (!/customerOptions\.find\(\(c\) => c\.value === customerFilter\)/.test(body)) {
    failures.push("filterCustomerName no longer checks customerOptions (the full roster) before falling back to the filtered credit-memos list");
  }
  const rosterIdx = body.indexOf("customerOptions.find");
  const fallbackIdx = body.indexOf("creditMemosQuery.data?.credit_memos ?? []).find");
  if (rosterIdx === -1 || fallbackIdx === -1 || rosterIdx > fallbackIdx) {
    failures.push("roster lookup must run BEFORE the credit-memos fallback (fallback is only correct as a last resort)");
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const real = fs.readFileSync(FILE, "utf8");
  const realFailures = inspect(real);
  if (realFailures.length !== 0) {
    console.error("verify-credit-memos-filter-badge-uses-roster --selftest FAILED: real source itself fails:", realFailures);
    process.exit(1);
  }
  const mutated = real.replace(
    `  const filterCustomerName = useMemo(() => {
    if (!customerFilter) return null;
    const fromRoster = customerOptions.find((c) => c.value === customerFilter)?.label ?? null;
    if (fromRoster) return fromRoster;
    return (creditMemosQuery.data?.credit_memos ?? []).find((c) => c.customer_id === customerFilter)?.customer_name ?? null;
  }, [customerOptions, creditMemosQuery.data?.credit_memos, customerFilter]);`,
    `  const filterCustomerName = useMemo(() => {
    if (!customerFilter) return null;
    return (creditMemosQuery.data?.credit_memos ?? []).find((c) => c.customer_id === customerFilter)?.customer_name ?? null;
  }, [creditMemosQuery.data?.credit_memos, customerFilter]);`,
  );
  if (mutated === real) {
    console.error("verify-credit-memos-filter-badge-uses-roster --selftest: mutation did not match live source — update the test");
    process.exit(1);
  }
  const mutatedFailures = inspect(mutated);
  if (mutatedFailures.length === 0) {
    console.error("verify-credit-memos-filter-badge-uses-roster --selftest FAILED: mutation was not caught");
    process.exit(1);
  }
  console.log("verify-credit-memos-filter-badge-uses-roster --selftest: OK (mutation caught, real source clean)");
  process.exit(0);
}

const source = fs.readFileSync(FILE, "utf8");
const failures = inspect(source);
if (failures.length > 0) {
  console.error("verify-credit-memos-filter-badge-uses-roster FAILED:");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log("verify-credit-memos-filter-badge-uses-roster: OK — credit-memos customer filter-badge checks the full roster before falling back to the filtered list");
