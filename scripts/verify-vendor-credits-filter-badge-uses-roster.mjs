#!/usr/bin/env node
// ACCT-F5606-C: sibling of ACCT-F5606-B (CreditMemosPage). VendorCreditsPage's vendor filter-badge
// derived its label ONLY from creditsQuery's (already vendor-filtered) data, so any vendor with zero
// vendor credits -- the common case -- rendered as "Vendor — not visible", a phrase entity-label.ts
// reserves for a genuine RLS/deactivation signal. Fix: check vendorOptions (the full, unfiltered
// roster from listVendors) first. Guard requires the roster lookup to run before the credits fallback.
import fs from "node:fs";

const FILE = "apps/frontend/src/pages/accounting/VendorCreditsPage.tsx";

function inspect(source) {
  const failures = [];

  const match = source.match(
    /const filterVendorName = useMemo\(\(\) => \{[\s\S]*?\}, \[vendorOptions, creditsQuery\.data\?\.credits, vendorFilter\]\);/,
  );
  if (!match) {
    failures.push("filterVendorName useMemo not found with vendorOptions in its dependency array");
    return failures;
  }
  const body = match[0];
  if (!/vendorOptions\.find\(\(v\) => v\.value === vendorFilter\)/.test(body)) {
    failures.push("filterVendorName no longer checks vendorOptions (the full roster) before falling back to the filtered credits list");
  }
  const rosterIdx = body.indexOf("vendorOptions.find");
  const fallbackIdx = body.indexOf("creditsQuery.data?.credits ?? []).find");
  if (rosterIdx === -1 || fallbackIdx === -1 || rosterIdx > fallbackIdx) {
    failures.push("roster lookup must run BEFORE the credits fallback (fallback is only correct as a last resort)");
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const real = fs.readFileSync(FILE, "utf8");
  const realFailures = inspect(real);
  if (realFailures.length !== 0) {
    console.error("verify-vendor-credits-filter-badge-uses-roster --selftest FAILED: real source itself fails:", realFailures);
    process.exit(1);
  }
  const mutated = real.replace(
    `  const filterVendorName = useMemo(() => {
    if (!vendorFilter) return null;
    const fromRoster = vendorOptions.find((v) => v.value === vendorFilter)?.label ?? null;
    if (fromRoster) return fromRoster;
    return (creditsQuery.data?.credits ?? []).find((c) => c.vendor_id === vendorFilter)?.vendor_name ?? null;
  }, [vendorOptions, creditsQuery.data?.credits, vendorFilter]);`,
    `  const filterVendorName = useMemo(() => {
    if (!vendorFilter) return null;
    return (creditsQuery.data?.credits ?? []).find((c) => c.vendor_id === vendorFilter)?.vendor_name ?? null;
  }, [creditsQuery.data?.credits, vendorFilter]);`,
  );
  if (mutated === real) {
    console.error("verify-vendor-credits-filter-badge-uses-roster --selftest: mutation did not match live source — update the test");
    process.exit(1);
  }
  const mutatedFailures = inspect(mutated);
  if (mutatedFailures.length === 0) {
    console.error("verify-vendor-credits-filter-badge-uses-roster --selftest FAILED: mutation was not caught");
    process.exit(1);
  }
  console.log("verify-vendor-credits-filter-badge-uses-roster --selftest: OK (mutation caught, real source clean)");
  process.exit(0);
}

const source = fs.readFileSync(FILE, "utf8");
const failures = inspect(source);
if (failures.length > 0) {
  console.error("verify-vendor-credits-filter-badge-uses-roster FAILED:");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log("verify-vendor-credits-filter-badge-uses-roster: OK — vendor credits vendor filter-badge checks the full roster before falling back to the filtered list");
