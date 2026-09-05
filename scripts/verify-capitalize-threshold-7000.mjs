#!/usr/bin/env node
/**
 * ND-FA-01 / A4-D6 — pin the owner-locked $7,000 capitalize-vs-expense threshold.
 *
 *   node scripts/verify-capitalize-threshold-7000.mjs
 *   node scripts/verify-capitalize-threshold-7000.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-capitalize-threshold-7000";
const SRC = "apps/backend/src/accounting/capitalize-threshold.ts";
// GO-19 owner ruling (docs/lockdown/GO-19-OWNER-DECISIONS-CLOSED-2026-09-01.md §4, CLOSED): "the
// $7,000 rule is NEVER CALLED. wo-ap-posting.service.ts posts via generic category mapping and
// never reaches capitalize-threshold.ts." This guard's second half pins the WIRING, not just the
// threshold contract, so that defect cannot silently regress once fixed.
const POSTER_SRC = "apps/backend/src/accounting/maintenance-posting/poster.service.ts";
const WO_AP = "apps/backend/src/maint/wo-ap-posting.service.ts";
const WO_AP_TEST = "apps/backend/src/maint/__tests__/wo-ap-posting.service.test.ts";
const WO_MODAL = "apps/frontend/src/pages/maintenance/components/CreateWorkOrderModal.tsx";
const WO_IDENTIFICATION = "apps/frontend/src/pages/maintenance/components/CreateWOSectionIdentification.tsx";

function read() {
  return fs.readFileSync(path.join(ROOT, SRC), "utf8");
}

function readPoster() {
  return fs.readFileSync(path.join(ROOT, POSTER_SRC), "utf8");
}

function wiringErrors(posterSrc) {
  const errors = [];
  if (!/from\s+["']\.\.\/capitalize-threshold\.js["']/.test(posterSrc) || !/decideRepairBooksTreatment/.test(posterSrc)) {
    errors.push("poster.service.ts must import and call decideRepairBooksTreatment from capitalize-threshold.ts");
  }
  if (!/resolveRoleAccount/.test(posterSrc)) {
    errors.push("poster.service.ts must resolve the WO-close bill-line account via resolveRoleAccount (coa-roles resolver), not a category default");
  }
  if (!/["']fixed_asset_default["']/.test(posterSrc)) {
    errors.push('poster.service.ts must route the capitalize path to the "fixed_asset_default" CoA role (A4-D1)');
  }
  if (!/["']heavy_repair_expense["']/.test(posterSrc)) {
    errors.push('poster.service.ts must route the expense path to the "heavy_repair_expense" CoA role (A4-D2)');
  }
  // The old per-line category default this defect described — regression sentinel: it must not
  // return as the WO-close bill-line account source.
  if (/resolveAccountForCategory\(input\.operating_company_id,\s*["']maintenance["']/.test(posterSrc)) {
    errors.push("poster.service.ts must not resolve the WO-close bill-line account via the maintenance category default (resolveAccountForCategory) — that is the exact defect this guard exists to prevent regressing to");
  }
  return errors;
}

function contractErrors(src) {
  const errors = [];
  if (!/CAPITALIZE_REPAIR_THRESHOLD_CENTS\s*=\s*700_000/.test(src) && !/CAPITALIZE_REPAIR_THRESHOLD_CENTS\s*=\s*700000/.test(src)) {
    errors.push("must export CAPITALIZE_REPAIR_THRESHOLD_CENTS = 700_000 ($7,000)");
  }
  if (!/decideRepairBooksTreatment/.test(src)) {
    errors.push("must export decideRepairBooksTreatment");
  }
  if (!/amountCents\s*>=\s*CAPITALIZE_REPAIR_THRESHOLD_CENTS/.test(src)) {
    errors.push("decideRepairBooksTreatment must capitalize at-or-above threshold ( >= )");
  }
  if (!/"capitalize"/.test(src) || !/"expense"/.test(src)) {
    errors.push("must return capitalize | expense");
  }
  if (!/A4-D6/.test(src) && !/\$7,000/.test(src)) {
    errors.push("must cite owner lock A4-D6 / $7,000 in source comment");
  }
  if (!/HEAVY_REPAIR_EXPENSE_COA_ROLE\s*=\s*"heavy_repair_expense"/.test(src)) {
    errors.push('must export HEAVY_REPAIR_EXPENSE_COA_ROLE = "heavy_repair_expense" (A4-D2)');
  }
  if (!/A4-D2/.test(src)) errors.push("must cite owner lock A4-D2 Heavy Repair Expense");
  if (!/FIXED_ASSET_REPAIR_COA_ROLE/.test(src)) errors.push("must export FIXED_ASSET_REPAIR_COA_ROLE");
  if (!/repairBooksCoaRole/.test(src)) errors.push("must export repairBooksCoaRole");
  return errors;
}

function woApWiringErrors(woApSrc, testSrc) {
  const errors = [];
  if (!/decideRepairBooksTreatment/.test(woApSrc)) errors.push("wo-ap-posting must call decideRepairBooksTreatment");
  if (!/repairBooksCoaRole|resolveWoApRepairCoaRole/.test(woApSrc)) errors.push("wo-ap-posting must route via repairBooksCoaRole");
  if (!/resolveRoleAccountOptional/.test(woApSrc)) errors.push("wo-ap-posting must resolve via resolveRoleAccountOptional");
  if (!/699_900/.test(testSrc)) errors.push("test must assert $6,999 expense path");
  if (!/700_100/.test(testSrc)) errors.push("test must assert $7,001 capitalize path");
  if (!/fixed_asset_default|FIXED_ASSET_REPAIR_COA_ROLE/.test(woApSrc + testSrc)) errors.push("must reference fixed_asset_default capitalize path");
  return errors;
}

function uiErrors(modalSrc, identificationSrc) {
  const errors = [];
  if (!/CAPITALIZE_REPAIR_THRESHOLD_DOLLARS\s*=\s*7_000/.test(modalSrc)) {
    errors.push("work-order UI must use the owner-locked $7,000 threshold");
  }
  if (!modalSrc.includes('data-testid="wo-books-treatment"') || (modalSrc.match(/<BooksTreatmentNotice/g) ?? []).length < 2) {
    errors.push("create and edit work-order surfaces must both render the books-treatment disclosure");
  }
  if (!modalSrc.includes("Fixed Asset – Trucks") || !modalSrc.includes("fixed_asset_default")) {
    errors.push("capitalized repair disclosure must name Fixed Asset – Trucks and fixed_asset_default");
  }
  if (!modalSrc.includes("Heavy Repair Expense") || !modalSrc.includes("heavy_repair_expense")) {
    errors.push("under-threshold repair disclosure must name Heavy Repair Expense and heavy_repair_expense");
  }
  for (const kind of ["unit", "trailer", "load"]) {
    const block = identificationSrc.match(new RegExp(`<EntityPicker[\\s\\S]{0,220}?kind=["']${kind}["'][\\s\\S]{0,420}?>`))?.[0] ?? "";
    if (!block.includes("allowCreate")) errors.push(`${kind} picker must explicitly expose + Create`);
  }
  return errors;
}

function selftest() {
  const good = [
    "export const CAPITALIZE_REPAIR_THRESHOLD_CENTS = 700_000;",
    'export const HEAVY_REPAIR_EXPENSE_COA_ROLE = "heavy_repair_expense" as const;',
    'export const FIXED_ASSET_REPAIR_COA_ROLE = "fixed_asset_default" as const;',
    'export function decideRepairBooksTreatment(amountCents: number) {',
    "  return amountCents >= CAPITALIZE_REPAIR_THRESHOLD_CENTS ? \"capitalize\" : \"expense\";",
    "}",
    "export function repairBooksCoaRole(amountCents: number) { return \"heavy_repair_expense\"; }",
    "// A4-D6 — $7,000",
    "// A4-D2 — Heavy Repair Expense",
  ].join("\n");
  if (contractErrors(good).length) {
    console.error(`${LABEL} --selftest FAIL good:`, contractErrors(good));
    process.exit(1);
  }
  const wrong = good.replace("700_000", "500_000");
  if (!contractErrors(wrong).some((e) => e.includes("700_000"))) {
    console.error(`${LABEL} --selftest FAIL wrong threshold not caught`);
    process.exit(1);
  }
  const lt = good.replace(">=", ">");
  if (!contractErrors(lt).some((e) => e.includes(">="))) {
    console.error(`${LABEL} --selftest FAIL exclusive bound not caught`);
    process.exit(1);
  }

  // Wiring half: prove the check FAILS on the pre-fix shape (category-default only, never calls the
  // threshold) and PASSES on the fixed shape (mutated copies of the real assertion, per DoD §4).
  const wiredGood = [
    'import { decideRepairBooksTreatment } from "../capitalize-threshold.js";',
    'import { resolveRoleAccount } from "../coa-roles/resolver.service.js";',
    'const role = treatment === "capitalize" ? "fixed_asset_default" : "heavy_repair_expense";',
    "const capitalizeAccountId = await resolveRoleAccount(client, input.operating_company_id, role);",
  ].join("\n");
  if (wiringErrors(wiredGood).length) {
    console.error(`${LABEL} --selftest FAIL wired-good:`, wiringErrors(wiredGood));
    process.exit(1);
  }
  const unwired = [
    'import { resolveAccountForCategory } from "../expense-category-map/resolver.service.js";',
    'const categoryCode = mapMaintenanceCategoryCode(wo, line);',
    'const account = await resolveAccountForCategory(input.operating_company_id, "maintenance", categoryCode);',
  ].join("\n");
  if (wiringErrors(unwired).length === 0) {
    console.error(`${LABEL} --selftest FAIL — pre-fix category-default-only shape was NOT flagged`);
    process.exit(1);
  }
  const regressed = wiredGood + '\nconst account = await resolveAccountForCategory(input.operating_company_id, "maintenance", categoryCode);';
  if (!wiringErrors(regressed).some((e) => e.includes("must not resolve"))) {
    console.error(`${LABEL} --selftest FAIL — regression back to category-default alongside the new wiring was NOT flagged`);
    process.exit(1);
  }

  const uiGood = [
    "const CAPITALIZE_REPAIR_THRESHOLD_DOLLARS = 7_000;",
    'function BooksTreatmentNotice() { return <div data-testid="wo-books-treatment">Fixed Asset – Trucks fixed_asset_default Heavy Repair Expense heavy_repair_expense</div>; }',
    '<BooksTreatmentNotice totalDollars={1} />',
    '<BooksTreatmentNotice totalDollars={2} />',
  ].join("\n");
  const pickerGood = ['<EntityPicker kind="unit" allowCreate />', '<EntityPicker kind="trailer" allowCreate />', '<EntityPicker kind="load" allowCreate />'].join("\n");
  if (uiErrors(uiGood, pickerGood).length) {
    console.error(`${LABEL} --selftest FAIL UI-good:`, uiErrors(uiGood, pickerGood));
    process.exit(1);
  }
  if (!uiErrors(uiGood.replace("7_000", "7_500"), pickerGood).some((e) => e.includes("$7,000"))) {
    console.error(`${LABEL} --selftest FAIL — planted UI threshold drift escaped`);
    process.exit(1);
  }

  console.log(`${LABEL}: selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

if (!fs.existsSync(path.join(ROOT, SRC))) {
  console.error(`${LABEL}: FAIL — missing ${SRC}`);
  process.exit(1);
}
if (!fs.existsSync(path.join(ROOT, POSTER_SRC))) {
  console.error(`${LABEL}: FAIL — missing ${POSTER_SRC}`);
  process.exit(1);
}
const errors = contractErrors(read());
const wiring = wiringErrors(readPoster());
const woApPath = path.join(ROOT, WO_AP);
const woApTestPath = path.join(ROOT, WO_AP_TEST);
if (fs.existsSync(woApPath)) {
  wiring.push(...woApWiringErrors(fs.readFileSync(woApPath, "utf8"), fs.existsSync(woApTestPath) ? fs.readFileSync(woApTestPath, "utf8") : ""));
}
const modalPath = path.join(ROOT, WO_MODAL);
const identificationPath = path.join(ROOT, WO_IDENTIFICATION);
if (!fs.existsSync(modalPath) || !fs.existsSync(identificationPath)) {
  wiring.push("work-order create/edit UI sources are missing");
} else {
  wiring.push(...uiErrors(fs.readFileSync(modalPath, "utf8"), fs.readFileSync(identificationPath, "utf8")));
}
if (errors.length || wiring.length) {
  console.error(`${LABEL}: FAIL`);
  for (const e of [...errors, ...wiring]) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — capitalize threshold locked at $7,000 (700_000¢), wired into WO-close posting + wo-ap`);
process.exit(0);
