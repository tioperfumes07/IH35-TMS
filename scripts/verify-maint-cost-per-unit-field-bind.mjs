#!/usr/bin/env node
/**
 * Block 0441-mod11 — Maintenance cost per unit FE↔API field binding guard.
 *
 * ROOT CAUSE guarded: the Reports "Maintenance cost per unit" frontend read totals keys
 * (totals.parts_cents / labor_cents / outsourced_cents), row `miles`, and an array-shaped
 * by_category that the API never returns. The API emits totals.total_parts_cents /
 * total_labor_cents / total_outsourced_cents, row `miles_driven`, and by_category as an
 * object map (category → cents) — so the KPI tiles rendered blank/$NaN.
 *
 * This guard fails if the FE ever reads the wrong keys again, and also fails if the
 * backend payload keys drift away from what the FE binds to (both sides checked).
 *
 * Self-test: node scripts/verify-maint-cost-per-unit-field-bind.mjs --selftest
 * LINKAGE: report read path only — no schema, no GL, no banking.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();

const API_TS = "apps/frontend/src/api/reports.ts";
const PAGE_TSX = "apps/frontend/src/pages/reports/MaintenanceCostPerUnitPage.tsx";
const PAGE_TEST = "apps/frontend/src/pages/reports/MaintenanceCostPerUnitPage.test.tsx";
const BE_ROUTE = "apps/backend/src/reports/maintenance-cost-per-unit.routes.ts";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

/** Extract the MaintenanceCostPerUnitResponse type body (totals block lives inside). */
function extractResponseType(apiSrc) {
  const m = apiSrc.match(/export type MaintenanceCostPerUnitResponse = \{[\s\S]*?\n\};/);
  return m ? m[0] : "";
}

/** Extract the MaintenanceCostUnitRow type body. */
function extractRowType(apiSrc) {
  const m = apiSrc.match(/export type MaintenanceCostUnitRow = \{[\s\S]*?\n\};/);
  return m ? m[0] : "";
}

/**
 * Pure check logic so --selftest can plant failures.
 * Returns an array of failure strings (empty = PASS).
 */
export function checkSources({ apiSrc, pageSrc, testSrc, beSrc }) {
  const failures = [];

  const responseType = extractResponseType(apiSrc);
  const rowType = extractRowType(apiSrc);

  if (!responseType) failures.push(`${API_TS}: MaintenanceCostPerUnitResponse type not found`);
  if (!rowType) failures.push(`${API_TS}: MaintenanceCostUnitRow type not found`);

  // --- FE type: totals must use the API's total_*_cents keys, never the bare old names ---
  for (const key of ["total_parts_cents", "total_labor_cents", "total_outsourced_cents", "grand_total_cents"]) {
    if (responseType && !responseType.includes(key)) {
      failures.push(`${API_TS}: MaintenanceCostPerUnitResponse totals missing API key "${key}"`);
    }
  }
  // Old wrong totals keys (bare parts_cents etc. inside the response type but outside rows).
  // The response type itself must not declare bare parts_cents/labor_cents/outsourced_cents —
  // those belong on MaintenanceCostUnitRow only.
  if (responseType) {
    for (const bad of ["parts_cents", "labor_cents", "outsourced_cents"]) {
      const bare = new RegExp(`(?<!total_)\\b${bad}\\s*:`, "g");
      if (bare.test(responseType)) {
        failures.push(`${API_TS}: MaintenanceCostPerUnitResponse declares old totals key "${bad}" — API sends "total_${bad}"`);
      }
    }
    // by_category is an object map on the API, never an array of slices.
    if (!/by_category\s*:\s*Record<string,\s*number>/.test(responseType)) {
      failures.push(`${API_TS}: by_category must be typed Record<string, number> (API returns an object map, not an array)`);
    }
  }

  // --- FE row type: miles_driven (API name), never bare miles ---
  if (rowType) {
    if (!rowType.includes("miles_driven")) {
      failures.push(`${API_TS}: MaintenanceCostUnitRow missing API key "miles_driven"`);
    }
    if (/(?<!_)\bmiles\s*:/.test(rowType)) {
      failures.push(`${API_TS}: MaintenanceCostUnitRow declares old key "miles" — API sends "miles_driven"`);
    }
    if (!/cost_per_mile_cents\s*:\s*number\s*\|\s*null/.test(rowType)) {
      failures.push(`${API_TS}: cost_per_mile_cents must be typed number | null (API sends null when miles are 0)`);
    }
  }

  // --- Page: must not read the old keys that produced $NaN ---
  const badPageReads = [
    [/\bt\.parts_cents\b/, 'totals tile reads t.parts_cents — must read t.total_parts_cents'],
    [/\bt\.labor_cents\b/, 'totals tile reads t.labor_cents — must read t.total_labor_cents'],
    [/\bt\.outsourced_cents\b/, 'totals tile reads t.outsourced_cents — must read t.total_outsourced_cents'],
    [/\br\.miles\b(?!_)/, 'row read r.miles — must read r.miles_driven'],
    [/\.amount_cents\b/, 'reads .amount_cents from by_category — API returns object map, use Object.entries'],
    [/key:\s*["']miles["']/, 'table column keyed "miles" — must key "miles_driven"'],
  ];
  for (const [re, msg] of badPageReads) {
    if (re.test(pageSrc)) failures.push(`${PAGE_TSX}: ${msg}`);
  }
  const requiredPageReads = [
    ["total_parts_cents", "totals.total_parts_cents"],
    ["total_labor_cents", "totals.total_labor_cents"],
    ["total_outsourced_cents", "totals.total_outsourced_cents"],
    ["miles_driven", "row miles_driven"],
  ];
  for (const [needle, label] of requiredPageReads) {
    if (!pageSrc.includes(needle)) failures.push(`${PAGE_TSX}: no longer binds ${label}`);
  }

  // --- Test fixture: must mirror the real API contract ---
  if (!testSrc.includes("miles_driven")) failures.push(`${PAGE_TEST}: fixture missing miles_driven (real API row key)`);
  if (!testSrc.includes("total_parts_cents")) failures.push(`${PAGE_TEST}: fixture missing total_parts_cents (real API totals key)`);
  if (/\bamount_cents\b/.test(testSrc)) failures.push(`${PAGE_TEST}: fixture uses amount_cents — API by_category is an object map`);
  if (!/not\.toContain\(\s*["']NaN["']\s*\)/.test(testSrc)) failures.push(`${PAGE_TEST}: missing no-NaN assertion on rendered KPI tiles`);

  // --- Backend drift: the payload keys the FE binds must still be emitted ---
  for (const key of ["total_parts_cents", "total_labor_cents", "total_outsourced_cents", "grand_total_cents", "miles_driven", "by_category"]) {
    if (!beSrc.includes(key)) {
      failures.push(`${BE_ROUTE}: no longer emits "${key}" — FE bindings will break; realign both sides in the same commit`);
    }
  }

  return failures;
}

function selftest() {
  const goodApi = [
    "export type MaintenanceCostUnitRow = {",
    "  unit_id: string;",
    "  parts_cents: number;",
    "  labor_cents: number;",
    "  outsourced_cents: number;",
    "  miles_driven: number;",
    "  cost_per_mile_cents: number | null;",
    "};",
    "export type MaintenanceCostPerUnitResponse = {",
    "  totals: { total_parts_cents: number; total_labor_cents: number; total_outsourced_cents: number; grand_total_cents: number };",
    "  by_category: Record<string, number>;",
    "};",
  ].join("\n");
  const goodPage = 'money(t.total_parts_cents); money(t.total_labor_cents); money(t.total_outsourced_cents); key: "miles_driven"; r.miles_driven';
  const goodTest = 'miles_driven: 1, total_parts_cents: 1, expect(document.body.textContent).not.toContain("NaN")';
  const goodBe = "total_parts_cents total_labor_cents total_outsourced_cents grand_total_cents miles_driven by_category";

  const cases = [
    ["clean sources pass", checkSources({ apiSrc: goodApi, pageSrc: goodPage, testSrc: goodTest, beSrc: goodBe }).length === 0],
    [
      "planted old totals key fails",
      checkSources({
        apiSrc: goodApi.replace("total_parts_cents: number;", "parts_cents: number;"),
        pageSrc: goodPage,
        testSrc: goodTest,
        beSrc: goodBe,
      }).length > 0,
    ],
    [
      "planted bare miles row key fails",
      checkSources({
        apiSrc: goodApi.replace("miles_driven: number;", "miles: number;"),
        pageSrc: goodPage,
        testSrc: goodTest,
        beSrc: goodBe,
      }).length > 0,
    ],
    [
      "planted t.parts_cents page read fails",
      checkSources({ apiSrc: goodApi, pageSrc: goodPage + " money(t.parts_cents)", testSrc: goodTest, beSrc: goodBe }).length > 0,
    ],
    [
      "planted by_category array type fails",
      checkSources({
        apiSrc: goodApi.replace("by_category: Record<string, number>;", "by_category: { category: string; amount_cents: number }[];"),
        pageSrc: goodPage,
        testSrc: goodTest,
        beSrc: goodBe,
      }).length > 0,
    ],
    [
      "backend drift fails",
      checkSources({ apiSrc: goodApi, pageSrc: goodPage, testSrc: goodTest, beSrc: goodBe.replace("miles_driven", "miles") }).length > 0,
    ],
  ];

  const failed = cases.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error("verify:maint-cost-per-unit-field-bind --selftest FAIL:");
    for (const [name] of failed) console.error("  ✗ " + name);
    process.exit(1);
  }
  console.log(`verify:maint-cost-per-unit-field-bind --selftest PASS (${cases.length} checks)`);
  process.exit(0);
}

if (process.argv.includes("--selftest")) selftest();

const failures = checkSources({
  apiSrc: read(API_TS),
  pageSrc: read(PAGE_TSX),
  testSrc: read(PAGE_TEST),
  beSrc: read(BE_ROUTE),
});

if (failures.length) {
  console.error("verify:maint-cost-per-unit-field-bind FAIL — FE bindings don't match the maintenance-cost-per-unit API:");
  for (const f of failures) console.error("  ✗ " + f);
  process.exit(1);
}
console.log("verify:maint-cost-per-unit-field-bind PASS (FE reads real API keys: total_*_cents totals, miles_driven, by_category map)");
