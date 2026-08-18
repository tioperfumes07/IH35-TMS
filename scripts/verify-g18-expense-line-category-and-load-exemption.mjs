#!/usr/bin/env node
/**
 * verify-g18-expense-line-category-and-load-exemption.mjs
 *
 * LV-G18-INERT-ON-EXPENSE-LINES — accounting.enforce_load_fk_invariant() (migration 0093) is a real
 * hard BEFORE INSERT/UPDATE trigger on accounting.expense_lines, but line_category was never written
 * by the TMS-native create path (expenses.routes.ts), so the trigger's own `IF NEW.line_category IS
 * NOT NULL` branch never ran and the G18 load-linkage invariant stayed permanently dormant (0 of
 * 34,001 rows, board finding 2026-08-16). A backend-only activation was designed then deliberately
 * withheld — writing line_category alone, with no escape hatch, would turn a silently-succeeding
 * no-load diesel/toll/lumper expense into a raw Postgres trigger exception.
 *
 * This guard proves the PAIRED fix landed together, not the backend half alone:
 *  1. expenses.routes.ts derives line_category from the operator's own expense_category_uuid via a
 *     lowercase-code join against accounting.line_category_load_required (no invented taxonomy).
 *  2. The same INSERT also carries load_id and load_exemption_reason so the trigger's FK-or-reason
 *     branch always has what it needs when line_category is one of the 9 G18 categories.
 *  3. The create-expense Zod schema accepts load_exemption_reason with the same >=20-char floor the
 *     DB trigger itself enforces (min(20)), so a too-short reason fails with a clear 400, not a raw
 *     Postgres 500.
 *  4. RecordExpenseForm.tsx and recordExpenseSubmit.ts share ONE regex (OVER_THE_ROAD_CATEGORY_RE) —
 *     no drift between what shows the required asterisk / no-load-reason field and what actually
 *     blocks submit — and it no longer contains "gas"/"ifta" (false positives; IFTA is a permits
 *     account, not G18) while it does cover toll/scale/lumper/parking/roadside/detention (previously
 *     missing entirely).
 *  5. submitRecordExpense blocks submit (load OR a >=20-char reason) instead of silently proceeding,
 *     and threads load_exemption_reason into the createExpense request body.
 */
import { readFileSync } from "node:fs";

const failures = [];

const routesPath = "apps/backend/src/accounting/expenses.routes.ts";
const routesSrc = readFileSync(routesPath, "utf8");

if (!/load_exemption_reason: z\s*\.\s*string\(\)[^\n]*min\(20\)/.test(routesSrc)) {
  failures.push(`${routesPath}: create-expense body schema no longer accepts load_exemption_reason with a >=20-char floor`);
}
if (!/JOIN accounting\.line_category_load_required r ON r\.line_category = lower\(ec\.code\)/.test(routesSrc)) {
  failures.push(`${routesPath}: line_category derivation join (catalogs.expense_categories -> accounting.line_category_load_required) is missing`);
}
if (!/lineColumns\.push\("line_category"\)/.test(routesSrc)) {
  failures.push(`${routesPath}: expense_lines INSERT no longer pushes line_category`);
}
if (!/lineColumns\.push\("load_id"\)/.test(routesSrc)) {
  failures.push(`${routesPath}: expense_lines INSERT no longer pushes load_id — line_category alone would re-open the withheld-fix regression`);
}
if (!/lineColumns\.push\("load_exemption_reason"\)/.test(routesSrc)) {
  failures.push(`${routesPath}: expense_lines INSERT no longer pushes load_exemption_reason — no escape hatch for a legitimate no-load G18 expense`);
}

const submitPath = "apps/frontend/src/components/expenses/recordExpenseSubmit.ts";
const submitSrc = readFileSync(submitPath, "utf8");

if (!/export const OVER_THE_ROAD_CATEGORY_RE/.test(submitSrc)) {
  failures.push(`${submitPath}: OVER_THE_ROAD_CATEGORY_RE is no longer exported — RecordExpenseForm.tsx can drift from the submit-blocking taxonomy`);
}
if (/\bgas\b|\bifta\b/i.test((submitSrc.match(/OVER_THE_ROAD_CATEGORY_RE\s*=\s*\/[^/]*\//)?.[0]) ?? "")) {
  failures.push(`${submitPath}: OVER_THE_ROAD_CATEGORY_RE still matches "gas"/"ifta" — those are not G18 categories (IFTA is a permits account) and re-open the false-positive trap`);
}
for (const term of ["toll", "scale", "lumper", "parking", "roadside", "detention"]) {
  const re = new RegExp(`OVER_THE_ROAD_CATEGORY_RE\\s*=\\s*\\/[^/]*${term}[^/]*\\/`);
  if (!re.test(submitSrc)) {
    failures.push(`${submitPath}: OVER_THE_ROAD_CATEGORY_RE no longer matches "${term}" — a real G18 category would stop requiring a load or reason`);
  }
}
if (!/if \(isOverTheRoadCategory && !values\.loadId\)/.test(submitSrc)) {
  failures.push(`${submitPath}: submitRecordExpense no longer blocks submit for an over-the-road category with no load`);
}
if (!/exemptionReason\.length < 20/.test(submitSrc)) {
  failures.push(`${submitPath}: submitRecordExpense no longer enforces the >=20-char floor on the no-load reason before submit`);
}
if (!/load_exemption_reason: exemptionReason/.test(submitSrc)) {
  failures.push(`${submitPath}: submitRecordExpense no longer threads load_exemption_reason into the createExpense request body`);
}

const formPath = "apps/frontend/src/components/expenses/RecordExpenseForm.tsx";
const formSrc = readFileSync(formPath, "utf8");

if (!/isOverTheRoadCategoryLabel/.test(formSrc)) {
  failures.push(`${formPath}: no longer imports/uses isOverTheRoadCategoryLabel — the field label/hint can drift from the submit-blocking taxonomy`);
}
if (!/No-load reason \* \(min 20 characters\)/.test(formSrc)) {
  failures.push(`${formPath}: the no-load-reason textarea is missing — the escape hatch this fix depends on has no FE surface`);
}
if (!/loadExemptionReason: event\.target\.value/.test(formSrc)) {
  failures.push(`${formPath}: the no-load-reason textarea no longer writes into values.loadExemptionReason`);
}

const apiPath = "apps/frontend/src/api/accounting.ts";
const apiSrc = readFileSync(apiPath, "utf8");
if (!/load_exemption_reason\?: string/.test(apiSrc)) {
  failures.push(`${apiPath}: createExpense's body type no longer accepts load_exemption_reason`);
}

if (failures.length > 0) {
  console.error("verify-g18-expense-line-category-and-load-exemption: FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(
  "verify-g18-expense-line-category-and-load-exemption: OK — line_category derivation is paired with load_id + load_exemption_reason in the same INSERT, and FE requires one of load/reason for the real G18 taxonomy, not the old fuel/gas/ifta heuristic"
);
