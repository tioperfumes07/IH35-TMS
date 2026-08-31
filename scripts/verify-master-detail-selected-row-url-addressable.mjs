#!/usr/bin/env node
// MASTER-DETAIL-SELECTED-ROW-NOT-URL-ADDRESSABLE: Vendors.tsx and Customers.tsx both make the
// active detail TAB URL-addressable (?tab=...) but used plain useState("") for the selected row --
// a reload (or a bookmarked/shared link) always fell back to the FIRST row in the current sort,
// silently landing on the wrong record. Confirmed live: select a non-first row, reload the same
// URL, selection resets with no error. Guard requires the selected-id state to be derived from and
// written back to searchParams (the same mechanism already used for tab/listTab/category), on
// both pages.
import fs from "node:fs";

const FILES = {
  vendors: "apps/frontend/src/pages/Vendors.tsx",
  customers: "apps/frontend/src/pages/Customers.tsx",
};
const PARAM_BY_FILE = { vendors: "vendor", customers: "customer" };
const ID_VAR_BY_FILE = { vendors: "selectedVendorId", customers: "selectedCustomerId" };

function inspect(source, key) {
  const failures = [];
  const idVar = ID_VAR_BY_FILE[key];
  const param = PARAM_BY_FILE[key];

  if (new RegExp(`const \\[${idVar}, set${idVar[0].toUpperCase()}${idVar.slice(1)}\\] = useState\\(""\\);`).test(source)) {
    failures.push(`${key}: ${idVar} is back to plain useState("") -- reload/bookmark loses the selection again`);
  }
  if (!new RegExp(`searchParams\\.get\\("${param}"\\)`).test(source)) {
    failures.push(`${key}: ${idVar} no longer reads from the "${param}" URL param`);
  }
  if (!new RegExp(`params\\.set\\("${param}", next\\)`).test(source)) {
    failures.push(`${key}: the ${idVar} setter no longer writes the "${param}" URL param`);
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const real = Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, fs.readFileSync(f, "utf8")]));
  const realFailures = Object.entries(real).flatMap(([k, s]) => inspect(s, k));
  if (realFailures.length !== 0) {
    console.error("verify-master-detail-selected-row-url-addressable --selftest FAILED: real source itself fails:", realFailures);
    process.exit(1);
  }
  const mutatedVendors = real.vendors.replace(
    `const selectedVendorId = searchParams.get("vendor") ?? "";
  const setSelectedVendorId = (next: string) => {
    const params = new URLSearchParams(searchParams);
    if (!next) params.delete("vendor");
    else params.set("vendor", next);
    setSearchParams(params, { replace: true });
  };`,
    `const [selectedVendorId, setSelectedVendorId] = useState("");`,
  );
  if (mutatedVendors === real.vendors) {
    console.error("verify-master-detail-selected-row-url-addressable --selftest: vendors mutation did not match live source — update the test");
    process.exit(1);
  }
  const mutatedFailures = inspect(mutatedVendors, "vendors");
  if (mutatedFailures.length === 0) {
    console.error("verify-master-detail-selected-row-url-addressable --selftest FAILED: vendors mutation was not caught");
    process.exit(1);
  }
  console.log("verify-master-detail-selected-row-url-addressable --selftest: OK (mutation caught, real source clean)");
  process.exit(0);
}

const failures = Object.entries(FILES).flatMap(([k, f]) => inspect(fs.readFileSync(f, "utf8"), k));
if (failures.length > 0) {
  console.error("verify-master-detail-selected-row-url-addressable FAILED:");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log("verify-master-detail-selected-row-url-addressable: OK — Vendors.tsx and Customers.tsx both persist their master-detail selection through the URL, not just in-memory state");
