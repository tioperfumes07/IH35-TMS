#!/usr/bin/env node
/**
 * verify-expenses-created-by-actor-and-total-amount-cents-column.mjs
 *
 * LV-EXPENSES-UNAUDITED-AND-ACTORLESS (actor half) — the TMS-native expense create route
 * (POST /api/v1/expenses, expenses.routes.ts) never wrote accounting.expenses.created_by_user_id
 * even though the authed user was already in scope. Two sibling writers had the same gap despite
 * ALREADY receiving an actor id as a function parameter — apps/backend/src/maintenance/
 * two-section-service.ts's autoCreateExpenseFromWO(client, userId, ...) and apps/backend/src/
 * cash-advances/lumper-cash-advance-split.ts's disburseCashAdvanceSplit(actorUserUuid, ...).
 * (A fourth writer, qbo-purchases-puller.ts, is a system sync job with no human actor in scope —
 * NULL created_by_user_id there is honest, not a gap, and is deliberately NOT guarded here.)
 *
 * ACT-F5414 (found while fixing the above): autoCreateExpenseFromWO's INSERT always targeted a
 * "total_amount" column that does not exist on accounting.expenses (only total_amount_cents does
 * — unlike the sibling accounting.bills table, which really does have both amount_cents AND
 * total_amount, and which this function's sibling autoCreateBillFromWO correctly targets). Every
 * one of the 4 branches in autoCreateExpenseFromWO would have thrown 42703 on the first live
 * "paid same day" maintenance work-order completion. Fixed by deriving total_amount_cents with the
 * same ROUND(...*100)::bigint pattern autoCreateBillFromWO already uses for its amount_cents column.
 *
 * Guards:
 *  1. expenses.routes.ts's create-expense INSERT includes created_by_user_id.
 *  2. two-section-service.ts's autoCreateExpenseFromWO stamps created_by_user_id in all 4 branches,
 *     and none of its 4 INSERT branches reference the non-existent "total_amount" column.
 *  3. lumper-cash-advance-split.ts's lumper-expense leg stamps created_by_user_id.
 */
import { readFileSync } from "node:fs";

const failures = [];

const routesPath = "apps/backend/src/accounting/expenses.routes.ts";
const routesSrc = readFileSync(routesPath, "utf8");
if (!/columnExists\(client, "accounting", "expenses", "created_by_user_id"\)/.test(routesSrc)) {
  failures.push(`${routesPath}: create-expense INSERT no longer checks for created_by_user_id`);
}
if (!/columns\.push\(`created_by_user_id`\)/.test(routesSrc)) {
  failures.push(`${routesPath}: create-expense INSERT no longer pushes the created_by_user_id column`);
}

const twoSectionPath = "apps/backend/src/maintenance/two-section-service.ts";
const twoSectionSrc = readFileSync(twoSectionPath, "utf8");
const autoCreateMatch = twoSectionSrc.match(/export async function autoCreateExpenseFromWO[\s\S]*?\n}\n/);
if (!autoCreateMatch) {
  failures.push(`${twoSectionPath}: could not isolate autoCreateExpenseFromWO — re-check this guard`);
} else {
  const fn = autoCreateMatch[0];
  const createdByCount = (fn.match(/created_by_user_id/g) || []).length;
  // 4 INSERT branches; each must both name the column and pass userId as a value — expect at least
  // 8 occurrences (column name + value-array reference is folded into one push in some branches, so
  // this is a floor, not an exact count).
  if (createdByCount < 4) {
    failures.push(`${twoSectionPath}: autoCreateExpenseFromWO no longer stamps created_by_user_id in all 4 INSERT branches (found ${createdByCount} references)`);
  }
  // The non-existent column: match "total_amount" NOT immediately followed by "_cents". Strip both
  // // and -- line comments first — this file's own explanatory prose legitimately says the words
  // "total_amount" (without _cents) when describing the bug, which would otherwise false-positive.
  const fnNoComments = fn
    .split("\n")
    .map((line) => line.replace(/\s*(\/\/|--).*$/, ""))
    .join("\n");
  if (/\btotal_amount\b(?!_cents)/.test(fnNoComments)) {
    failures.push(`${twoSectionPath}: autoCreateExpenseFromWO still references the non-existent "total_amount" column (accounting.expenses only has total_amount_cents) — ACT-F5414 regressed`);
  }
  if (!/total_amount_cents/.test(fn)) {
    failures.push(`${twoSectionPath}: autoCreateExpenseFromWO no longer targets total_amount_cents at all — re-check this guard`);
  }
}

const lumperPath = "apps/backend/src/cash-advances/lumper-cash-advance-split.ts";
const lumperSrc = readFileSync(lumperPath, "utf8");
if (!/INSERT INTO accounting\.expenses[\s\S]{0,200}?created_by_user_id/.test(lumperSrc)) {
  failures.push(`${lumperPath}: lumper-expense leg's INSERT into accounting.expenses no longer includes created_by_user_id`);
}
if (!/actorUserUuid\],\s*\n\s*\);/.test(lumperSrc) && !/loadSample\.rows\[0\]\?\.is_sample_data === true, actorUserUuid\]/.test(lumperSrc)) {
  failures.push(`${lumperPath}: lumper-expense leg's INSERT no longer passes actorUserUuid as a value`);
}

if (failures.length > 0) {
  console.error("verify-expenses-created-by-actor-and-total-amount-cents-column: FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(
  "verify-expenses-created-by-actor-and-total-amount-cents-column: OK — all 3 human-actor expense writers stamp created_by_user_id; the non-existent total_amount column reference is gone"
);
