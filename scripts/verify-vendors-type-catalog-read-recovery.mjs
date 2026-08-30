#!/usr/bin/env node

/**
 * @matrix-built vendors:list.segment.by_category:{connectivity}
 * VEND-F7534: the vendor-type catalog cannot fail as an apparently empty filter.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const relative = "apps/frontend/src/pages/Vendors.tsx";
const original = fs.readFileSync(path.join(process.cwd(), relative), "utf8");

function failures(source) {
  const found = [];
  if (!source.includes("vendorTypesQuery.isError ? (")) found.push("catalog failure is not rendered");
  if (!source.includes('data-testid="vendors-type-catalog-error"')) found.push("catalog failure has no stable test id");
  if (!source.includes("Couldn't load vendor types")) found.push("catalog failure lost vendor-type context");
  if (!source.includes("onRetry={() => void vendorTypesQuery.refetch()}")) found.push("catalog failure has no exact Retry");
  if (!source.includes("disabled={vendorTypesQuery.isError}")) found.push("failed catalog leaves the type selector actionable");
  if (!source.includes('createKind="vendor_type"')) found.push("healthy catalog lost inline vendor-type creation");
  if (!source.includes("row.display_name ?? row.vendor_type_name ?? row.vendor_type_code")) {
    found.push("healthy catalog lost canonical human-label resolution");
  }
  return found;
}

const baseline = failures(original);
if (baseline.length) {
  console.error(`verify-vendors-type-catalog-read-recovery: FAIL\n- ${baseline.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["visible error", "vendorTypesQuery.isError ? (", "vendorTypesQuery.isPending ? ("],
    ["exact Retry", "onRetry={() => void vendorTypesQuery.refetch()}", "onRetry={() => undefined}"],
    ["fail-closed selector", "disabled={vendorTypesQuery.isError}", "disabled={false}"],
    ["inline creation", 'createKind="vendor_type"', 'createKind="customer"'],
  ];
  const survivors = [];
  for (const [name, from, to] of mutations) {
    const mutated = original.replace(from, to);
    if (mutated === original || failures(mutated).length === 0) survivors.push(name);
  }
  if (survivors.length) {
    console.error(`verify-vendors-type-catalog-read-recovery: SELFTEST FAIL — surviving mutations: ${survivors.join(", ")}`);
    process.exit(1);
  }
  console.log(`verify-vendors-type-catalog-read-recovery: SELFTEST PASS — ${mutations.length}/${mutations.length} catalog mutations rejected`);
  process.exit(0);
}

console.log("verify-vendors-type-catalog-read-recovery: PASS — vendor-type filter fails visibly, retries exactly, and disables stale actions");
