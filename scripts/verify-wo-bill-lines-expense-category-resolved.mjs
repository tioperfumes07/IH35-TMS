#!/usr/bin/env node
// WO-BILL-EXPENSE-CATEGORY-CROSS-ENTITY-FK-BLOCKS-CREATE
//
// apps/backend/src/maintenance/two-section-service.ts copies maintenance.work_order_lines into
// either accounting.bill_lines or accounting.expense_lines when a WO is promoted to a Bill or an
// Expense. work_order_lines.expense_category_uuid points at catalogs.qbo_categories, but
// accounting.bill_lines.expense_category_uuid (like its expense_lines sibling) is FK'd to
// catalogs.expense_categories, same-entity (bill_lines_expense_category_same_entity_fkey,
// migration 202612890000_acct_f5686_bill_lines_expense_category_same_entity_fk.sql). The
// expense_lines branch already resolves the pointer via resolveExpenseCategoryById() before
// insert (ACCT-LINK-04); the bill_lines branch passed the raw, unresolved work-order-lines id
// straight through, which violated the FK 100% of the time a WO→Bill had any categorized cost
// line — reproduced live 2x on 2026-08-24 via Chrome (in-transit-issue → Convert to Work Order →
// "Create work order & Bill" with a Section A category line), Postgres error:
// `insert or update on table "bill_lines" violates foreign key constraint
// "bill_lines_expense_category_same_entity_fkey"`.
//
// This guard proves the bill_lines branch resolves expense_category_uuid the same honest way the
// expense_lines branch already does — via resolveExpenseCategoryById(), never the raw
// work-order-lines pointer — by mutation-testing that the raw-passthrough regression is caught.
import fs from "node:fs";

const TARGET = "apps/backend/src/maintenance/two-section-service.ts";

function readOrEmpty(path) {
  try {
    return fs.readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

function audit(src) {
  const failures = [];
  if (!src) {
    failures.push(`${TARGET} — MISSING`);
    return failures;
  }

  // Isolate the bill_lines INSERT block — including the JS parameter array after RETURNING id,
  // which is where the raw-vs-resolved expense_category_uuid value actually gets bound.
  const billBranchMatch = src.match(
    /const isBillLineCopy = destinationTable === "accounting\.bill_lines";[\s\S]{0,2200}?INSERT INTO accounting\.bill_lines[\s\S]{0,1500}?\]\s*\n\s*\);/
  );
  if (!billBranchMatch) {
    failures.push(`${TARGET} — could not isolate the bill_lines INSERT branch`);
    return failures;
  }
  const billBranch = billBranchMatch[0];

  if (!/resolveExpenseCategoryById\s*\(/.test(billBranch)) {
    failures.push(
      `${TARGET} — bill_lines branch must call resolveExpenseCategoryById() to resolve expense_category_uuid before insert (matching the expense_lines branch), not pass the raw work_order_lines pointer through`
    );
  }

  // The JS parameter array must bind the resolved variable, never the raw row.expense_category_uuid,
  // at the expense_category_uuid position (immediately after parentMapped).
  if (/parentMapped,\s*\n\s*row\.expense_category_uuid,/.test(billBranch)) {
    failures.push(
      `${TARGET} — bill_lines INSERT still binds the RAW row.expense_category_uuid instead of a resolved id; this reproduces bill_lines_expense_category_same_entity_fkey on any categorized line`
    );
  }

  return failures;
}

function main() {
  const args = process.argv.slice(2);
  const selftest = args.includes("--selftest");

  if (selftest) {
    const real = readOrEmpty(TARGET);
    if (!real) {
      console.error(`SELFTEST FAIL: ${TARGET} missing, cannot self-test`);
      process.exit(1);
    }

    // Offender 1: raw passthrough (the actual pre-fix shape) — the VALUES array binds the raw
    // row.expense_category_uuid instead of the resolved variable. Must be caught.
    const offender1 = real.replace(
      /parentMapped,(\s*)projectedBillCategoryId,(\s*)row\.service_item_uuid,/,
      (_m, i1, i2) => `parentMapped,${i1}row.expense_category_uuid,${i2}row.service_item_uuid,`
    );
    const f1 = audit(offender1);
    if (f1.length === 0) {
      console.error("SELFTEST FAIL: raw row.expense_category_uuid passthrough was not caught");
      process.exit(1);
    }

    // Offender 2: resolver call removed entirely but a different (still-raw) variable name used.
    const offender2 = real.replace(/resolveExpenseCategoryById\s*\(\s*client,\s*\{\s*\n(\s*)operatingCompanyId,\s*\n(\s*)categoryId: row\.expense_category_uuid,\s*\n(\s*)\}\s*\)/, "row.expense_category_uuid");
    const f2 = audit(offender2);
    if (f2.length === 0) {
      console.error("SELFTEST FAIL: removed resolveExpenseCategoryById() call was not caught");
      process.exit(1);
    }

    // Positive: the real, fixed file must pass clean.
    const fReal = audit(real);
    if (fReal.length !== 0) {
      console.error("SELFTEST FAIL: current (fixed) file did not pass:\n" + fReal.join("\n"));
      process.exit(1);
    }

    console.log("verify-wo-bill-lines-expense-category-resolved --selftest — OK (2/2 offenders caught, real file clean)");
    process.exit(0);
  }

  const src = readOrEmpty(TARGET);
  const failures = audit(src);
  if (failures.length) {
    console.error("verify-wo-bill-lines-expense-category-resolved — FAIL");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("verify-wo-bill-lines-expense-category-resolved — OK (bill_lines expense_category_uuid resolved via resolveExpenseCategoryById, never the raw work_order_lines pointer)");
  process.exit(0);
}

main();
