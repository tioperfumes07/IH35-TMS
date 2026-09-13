#!/usr/bin/env node
/** @matrix-built {"modules":["home"],"cols":["saved-query-chips"],"leafRe":"^home\\.saved_query_chips$","task":"D1-SAVED-QUERY-CHIPS"} */
/**
 * D1 (owner law, 2026-09-13, verbatim: "the exception queue BECOMES the navigation") — 5 named
 * saved-query chips with live counts, using the EXISTING DrillKpiCard chip component (no restyle,
 * no hand-rolled tile). Every count must be read straight off its own canonical source — never a
 * literal — so a chip's number can never drift from the list it drills into:
 *
 *   1. Unmatched fuel              -> exception-queue-counts.unmatched_fuel_count
 *   2. Insurance schedule          -> insurance summary.policies_expiring_30d
 *   3. Loads without a driver bill -> exception-queue-counts.loads_without_driver_bill_count
 *   4. Loads without a tour        -> exception-queue-counts.loads_without_tour_count
 *   5. Duplicate expenses          -> expense-duplicates.group_count
 *
 * Live bypass_rls proof (USMCA, pasted in the shipping PR) confirms each backend/service query
 * this guard pins actually produces the count OwnerHome.tsx renders.
 *
 * --selftest plants each regression and requires the guard to fail.
 */
import fs from "node:fs";

const HOME = "apps/frontend/src/pages/home/OwnerHome.tsx";
const REPORTS_API = "apps/frontend/src/api/reports.ts";

const CHIPS = [
  {
    name: "Unmatched fuel",
    testId: "saved-query-chip-unmatched-fuel",
    to: "/reports/fuel-reconciliation",
    valueRe: /value=\{exceptionQueueCountsQuery\.data\?\.unmatched_fuel_count\}/,
  },
  {
    name: "Insurance schedule",
    testId: "saved-query-chip-insurance-schedule",
    to: "/safety/insurance/policies",
    valueRe: /value=\{insuranceSummaryQuery\.data\?\.summary\.policies_expiring_30d\}/,
  },
  {
    name: "Loads without a driver bill",
    testId: "saved-query-chip-loads-without-driver-bill",
    to: "/reports/loads-without-driver-bill",
    valueRe: /value=\{exceptionQueueCountsQuery\.data\?\.loads_without_driver_bill_count\}/,
  },
  {
    name: "Loads without a tour",
    testId: "saved-query-chip-loads-without-tour",
    to: "/reports/loads-without-tour",
    valueRe: /value=\{exceptionQueueCountsQuery\.data\?\.loads_without_tour_count\}/,
  },
  {
    name: "Duplicate expenses",
    testId: "saved-query-chip-duplicate-expenses",
    to: "/accounting/expenses",
    valueRe: /value=\{expenseDuplicatesQuery\.data\?\.group_count\}/,
  },
];

function analyze(src) {
  const { home, reportsApi } = src;
  const errors = [];

  if (!/<DrillKpiCard\b/.test(home)) errors.push("OwnerHome.tsx must use the existing DrillKpiCard chip component");
  if (!/data-testid="saved-query-chips"/.test(home)) errors.push("OwnerHome.tsx must render a saved-query-chips section");

  for (const chip of CHIPS) {
    if (!new RegExp(`label="${chip.name}"`).test(home)) errors.push(`chip "${chip.name}": label missing`);
    if (!new RegExp(`testId="${chip.testId}"`).test(home)) errors.push(`chip "${chip.name}": testId ${chip.testId} missing`);
    if (!new RegExp(`to="${chip.to.replace(/\//g, "\\/")}"`).test(home)) errors.push(`chip "${chip.name}": drill target ${chip.to} missing`);
    if (!chip.valueRe.test(home)) errors.push(`chip "${chip.name}": value must be sourced from its own live query, not a literal`);
  }

  // The two chips this seat's backend owns must come from the real endpoint wrapper, not a
  // hand-typed number — verified against the shared reports.ts API module.
  if (!/export function getExceptionQueueCounts\(/.test(reportsApi)) errors.push("api/reports.ts must export getExceptionQueueCounts");
  if (!/\/api\/v1\/reports\/exception-queue-counts/.test(reportsApi)) errors.push("getExceptionQueueCounts must call GET /api/v1/reports/exception-queue-counts");

  // Insurance/expense counts must come through their own canonical modules, not be re-derived here.
  if (!/import \{ getInsuranceSummary \} from "\.\.\/\.\.\/api\/insurance";/.test(home)) errors.push("OwnerHome.tsx must import getInsuranceSummary from api/insurance (not re-derive the count)");
  if (!/import \{ listExpenseDuplicates \} from "\.\.\/\.\.\/api\/accounting";/.test(home)) errors.push("OwnerHome.tsx must import listExpenseDuplicates from api/accounting (not re-derive the count)");

  return errors;
}

const base = {
  home: fs.readFileSync(HOME, "utf8"),
  reportsApi: fs.readFileSync(REPORTS_API, "utf8"),
};

function withField(field, transform) {
  return { ...base, [field]: transform(base[field]) };
}

if (process.argv.includes("--selftest")) {
  const clean = analyze(base);
  if (clean.length) {
    console.error(`SELFTEST FAIL — clean source rejected:\n- ${clean.join("\n- ")}`);
    process.exit(1);
  }
  const mutations = [
    ["drops DrillKpiCard usage", withField("home", (s) => s.replaceAll("<DrillKpiCard", "<GoneKpiCard"))],
    ["drops the section testid", withField("home", (s) => s.replace('data-testid="saved-query-chips"', 'data-testid="gone"'))],
    ["drops a chip label", withField("home", (s) => s.replace('label="Unmatched fuel"', 'label="Gone"'))],
    ["drops a chip testId", withField("home", (s) => s.replace('testId="saved-query-chip-insurance-schedule"', 'testId="gone"'))],
    ["drops a chip drill target", withField("home", (s) => s.replace('to="/reports/loads-without-driver-bill"', 'to="/gone"'))],
    ["hardcodes a chip value (literal, not a live query)", withField("home", (s) => s.replace("value={exceptionQueueCountsQuery.data?.loads_without_tour_count}", "value={14}"))],
    ["duplicate-expenses value stops reading the live query", withField("home", (s) => s.replace("value={expenseDuplicatesQuery.data?.group_count}", "value={5}"))],
    ["reports.ts loses getExceptionQueueCounts", withField("reportsApi", (s) => s.replace("export function getExceptionQueueCounts(", "function goneExceptionQueueCounts("))],
    ["reports.ts loses the real endpoint URL", withField("reportsApi", (s) => s.replace("/api/v1/reports/exception-queue-counts", "/api/v1/reports/gone-counts"))],
    ["OwnerHome stops importing getInsuranceSummary", withField("home", (s) => s.replace('import { getInsuranceSummary } from "../../api/insurance";', ""))],
    ["OwnerHome stops importing listExpenseDuplicates", withField("home", (s) => s.replace('import { listExpenseDuplicates } from "../../api/accounting";', ""))],
  ];
  let caught = 0;
  for (const [label, mutated] of mutations) {
    if (analyze(mutated).length > 0) { caught += 1; continue; }
    console.error(`SELFTEST FAIL — mutation escaped: ${label}`);
    process.exit(1);
  }
  console.log(`PASS verify-saved-query-chips --selftest ${caught}/${mutations.length}`);
  process.exit(0);
}

const failures = analyze(base);
if (failures.length) {
  console.error("FAIL verify-saved-query-chips");
  failures.forEach((f) => console.error(`- ${f}`));
  process.exit(1);
}
console.log("PASS verify-saved-query-chips — 5 named chips, DrillKpiCard, each value sourced from its own live query");
