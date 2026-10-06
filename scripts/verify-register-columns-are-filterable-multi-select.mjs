#!/usr/bin/env node
// ROUND 370 (owner, 2026-10-03) — the Reclassify register: Truck, Driver, Unit, Trailer, Vendor — every column that can be
// shown is filterable and MULTI-select, with the same component as the account and status filters (MultiSelectDropdown),
// and a column chooser lets the owner ADD those columns. Static.
//
// Pins:
//   1. every record-naming column (account, type, class, item, load, truck, driver, trailer, vendor) has a
//      MultiSelectDropdown filter; the filter bar holds no single-select SelectCombobox / EntityPicker / ReferenceSelect
//   2. a Columns chooser (MultiSelectDropdown) exists and Truck / Driver / Trailer / Vendor are optional columns in it
//   3. the backend filters each as an array (= ANY) and serves the options from /reclassify/facets
//   4. the document-line join compares keys as uuid (a ::text cast of the key defeated the index: 26 s for a month)
import { readFileSync } from "node:fs";

// --selftest (Devin build order 2026-10-05): one case that MUST pass (the real tree) and one that
// MUST fail (a bare fixture cwd — a guard that reports green with none of its inputs present is a
// vacuous proof). Never writes to tracked source.
if (process.argv.includes("--selftest")) { await selftest_verify_register_columns_are_filterable_multi_select(); }
async function selftest_verify_register_columns_are_filterable_multi_select() {
  const { runGuard, runGuardInFixture, reportSelftest, statusOf, outputOf } = await import("./lib/guard-selftest.mjs");
  const { fileURLToPath } = await import("node:url");
  const me = fileURLToPath(import.meta.url);
  const live = runGuard(me);
  const empty = runGuardInFixture(me);
  reportSelftest("verify_register_columns_are_filterable_multi_select", [
    { name: "real tree green", pass: statusOf(live) === 0, detail: statusOf(live) === 0 ? undefined : outputOf(live).slice(-300) },
    { name: "bare fixture fails closed", pass: statusOf(empty) !== 0, detail: statusOf(empty) !== 0 ? undefined : outputOf(empty).slice(-200) },
  ]);
}

const LABEL = "verify-register-columns-are-filterable-multi-select";
const PAGE = "apps/frontend/src/pages/accounting/ReclassifyTransactionsPage.tsx";
const SVC = "apps/backend/src/accounting/reclassify/reclassify.service.ts";
const ROUTES = "apps/backend/src/accounting/reclassify/reclassify.routes.ts";
const page = readFileSync(PAGE, "utf8");
const svc = readFileSync(SVC, "utf8");
const routes = readFileSync(ROUTES, "utf8");
const fails = [];

const bar = page.slice(page.indexOf('data-testid="reclassify-filters"'), page.indexOf('data-testid="reclassify-find"'));
if (!bar) fails.push(`${PAGE}: filter bar not found`);
for (const f of ["account", "type", "class", "item", "load", "truck", "driver", "trailer", "vendor"]) {
  if (!new RegExp(`<MultiSelectDropdown[^<]{0,600}?data-testid="reclassify-filter-${f}"`).test(bar)) fails.push(`${PAGE}: the ${f} filter is not a MultiSelectDropdown`);
}
for (const single of ["<SelectCombobox", "<EntityPicker", "<ReferenceSelect"]) {
  if (bar.includes(single)) fails.push(`${PAGE}: the filter bar has a single-select ${single.slice(1)} — every filter is multi-select`);
}
if (!/<MultiSelectDropdown[^<]{0,600}?data-testid="reclassify-columns"/.test(bar)) fails.push(`${PAGE}: no Columns chooser`);
for (const c of ["truck", "driver", "trailer", "vendor"]) {
  if (!new RegExp(`\\{ key: "${c}", label: "[A-Za-z]+", sort: "${c}", optional: true \\}`).test(page)) fails.push(`${PAGE}: "${c}" is not an optional, sortable column`);
}

for (const k of ["unit_ids", "driver_ids", "trailer_ids", "vendor_ids", "class_ids"]) {
  if (!routes.includes(`${k}: z.string().optional()`)) fails.push(`${ROUTES}: no ${k} filter`);
}
if (!/\["unit_ids", "dim\.unit_id"\], \["driver_ids", "dim\.driver_id"\], \["trailer_ids", "dim\.trailer_id"\], \["vendor_ids", "dim\.vendor_id"\]/.test(svc)) fails.push(`${SVC}: dimension filters are not = ANY over dim.*`);
if (!routes.includes("/api/v1/accounting/reclassify/facets") || !svc.includes("export async function findReclassifyFacets")) fails.push("the facets endpoint is gone — filter options must come from the rows in the window");

const lineFrom = svc.slice(svc.indexOf("const LINE_FROM"), svc.indexOf("const LINE_SELECT"));
if (/\.id::text = p\.source_transaction/.test(lineFrom)) fails.push(`${SVC}: LINE_FROM compares a document key as text — that defeats the primary-key index`);

if (fails.length) {
  console.error(`${LABEL}: FAIL\n  ${fails.join("\n  ")}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — 9 multi-select column filters, a Columns chooser adding Truck / Driver / Trailer / Vendor, array filters + facets server side, index-usable join`);
