#!/usr/bin/env node
/**
 * @matrix-built {"modules":["accounting"],"cols":["expense","category"],"leafRe":"^expenses\\.","task":"EXPENSE-CATEGORY-FK"}
 * ACCT-LINK-04 (ACCT-F07) guard — catalogs.expense_categories must keep a real inbound link from
 * accounting.expense_lines, and every writer that stamps that column must resolve it against the
 * line's own entity catalog.
 *
 * The regression this exists to stop: expense_lines.expense_category_uuid shipped in migration 0050
 * as a bare uuid with no constraint, so it sat as a dangling pointer for months and the linkage audit
 * read "0 inbound FKs". A single-column FK would fix the count while still allowing a line to point
 * at another entity's category, so this guard demands the SAME-ENTITY composite form.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-expense-category-fk-wired";

const MIGRATION = "db/migrations/202608020000_acct_link_04_expense_lines_expense_category_fk.sql";
const RESOLVER = "apps/backend/src/accounting/expense-category-catalog.ts";
const EXPENSES_ROUTES = "apps/backend/src/accounting/expenses.routes.ts";
const PURCHASES_PULLER = "apps/backend/src/qbo-sync/qbo-purchases-puller.ts";
const TWO_SECTION = "apps/backend/src/maintenance/two-section-service.ts";

function read(rel, failures) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) {
    failures.push(`missing ${rel}`);
    return "";
  }
  return fs.readFileSync(abs, "utf8");
}

function checkMigration(sql, failures) {
  if (!/ADD CONSTRAINT expense_lines_expense_category_same_entity_fkey/.test(sql)) {
    failures.push(`${MIGRATION}: must add expense_lines_expense_category_same_entity_fkey`);
  }
  if (
    !/FOREIGN KEY \(operating_company_id, expense_category_uuid\)\s*REFERENCES catalogs\.expense_categories \(operating_company_id, id\)/.test(
      sql
    )
  ) {
    failures.push(
      `${MIGRATION}: the category FK must be the SAME-ENTITY composite (operating_company_id, expense_category_uuid) -> catalogs.expense_categories (operating_company_id, id)`
    );
  }
  if (!/ADD COLUMN IF NOT EXISTS operating_company_id uuid/.test(sql)) {
    failures.push(`${MIGRATION}: accounting.expense_lines needs its own operating_company_id for the composite FK`);
  }
  if (!/CREATE TRIGGER trg_expense_lines_derive_company/.test(sql)) {
    failures.push(
      `${MIGRATION}: without the derive-from-parent trigger the entity column can be left NULL and the composite FK stops enforcing`
    );
  }
  if (!/uq_expense_categories_company_id/.test(sql)) {
    failures.push(`${MIGRATION}: catalogs.expense_categories needs UNIQUE (operating_company_id, id) to be referenced`);
  }
  if (/\bDROP TABLE\b|\bDELETE FROM\b/i.test(sql)) {
    failures.push(`${MIGRATION}: never-delete law — this migration must be additive`);
  }
}

function checkResolver(src, failures) {
  if (!/export async function resolveExpenseCategoryById/.test(src)) {
    failures.push(`${RESOLVER}: must export resolveExpenseCategoryById`);
  }
  if (!/export async function resolveExpenseCategoryId\b/.test(src)) {
    failures.push(`${RESOLVER}: must export the composite resolveExpenseCategoryId`);
  }
  if (!/operating_company_id = \$/.test(src)) {
    failures.push(`${RESOLVER}: every category lookup must be entity-scoped`);
  }
  if (!/Number\(row\.matches\) !== 1/.test(src)) {
    failures.push(
      `${RESOLVER}: the account->category reverse lookup must refuse ambiguous bindings instead of picking one`
    );
  }
}

function checkWriters(routes, puller, twoSection, failures) {
  if (!/expense_category_id:\s*z\.string\(\)\.uuid\(\)/.test(routes)) {
    failures.push(`${EXPENSES_ROUTES}: create-expense body must accept expense_category_id`);
  }
  if (!/resolveExpenseCategoryId\(/.test(routes)) {
    failures.push(`${EXPENSES_ROUTES}: create-expense must resolve the category against the entity catalog`);
  }
  if (!/categoryNotInEntityCatalog/.test(routes)) {
    failures.push(
      `${EXPENSES_ROUTES}: an explicit category that does not resolve must be rejected, not silently dropped`
    );
  }
  if (!/columnExists\(client,\s*"accounting",\s*"expense_lines",\s*"expense_category_uuid"\)/.test(routes)) {
    failures.push(`${EXPENSES_ROUTES}: the category write must be column-gated`);
  }

  // ACCT-F4431380 (Lead 443.137 item 9e) — OLD: the QBO expense projection had to stamp expense_category_uuid
  //   only when exactly one active category bound the account (WHEN ecm.matches = 1).
  //   NEW: the QBO purchases puller writes NO expense line at all — it must contain no write into
  //   accounting.expenses / expense_lines, and projectPurchasesToExpenses must refuse by name
  //   (refuseQboNativeWrite). So no QBO path can stamp an unvalidated category. TMS writers above keep the checks.
  //   WHY: QuickBooks is a read-only archive; the projection/write was removed and its entry point refuses by name.
  if (/(?:INSERT\s+INTO|UPDATE)\s+accounting\.expense(?:s|_lines)\b/i.test(puller)) {
    failures.push(`${PURCHASES_PULLER}: the QBO purchases puller must not write accounting.expenses / expense_lines (QuickBooks is a read-only archive)`);
  }
  if (!/export async function projectPurchasesToExpenses[\s\S]{0,400}refuseQboNativeWrite\(/.test(puller)) {
    failures.push(`${PURCHASES_PULLER}: projectPurchasesToExpenses must refuse by name (refuseQboNativeWrite)`);
  }

  if (!/resolveExpenseCategoryById\(/.test(twoSection)) {
    failures.push(
      `${TWO_SECTION}: the WO->expense line copy must validate the work order's category against catalogs.expense_categories (it is sourced from catalogs.qbo_categories)`
    );
  }
}

function collectFailures(files) {
  const failures = [];
  checkMigration(files.migration, failures);
  checkResolver(files.resolver, failures);
  checkWriters(files.routes, files.puller, files.twoSection, failures);
  return failures;
}

function selftest() {
  const good = {
    migration: `
      ALTER TABLE accounting.expense_lines ADD COLUMN IF NOT EXISTS operating_company_id uuid;
      ADD CONSTRAINT uq_expense_categories_company_id UNIQUE (operating_company_id, id);
      CREATE TRIGGER trg_expense_lines_derive_company BEFORE INSERT ON accounting.expense_lines
      ADD CONSTRAINT expense_lines_expense_category_same_entity_fkey
        FOREIGN KEY (operating_company_id, expense_category_uuid)
        REFERENCES catalogs.expense_categories (operating_company_id, id);
    `,
    resolver: `
      export async function resolveExpenseCategoryById() { operating_company_id = $2::uuid }
      export async function resolveExpenseCategoryId() {}
      if (Number(row.matches) !== 1) return null;
    `,
    routes: `
      expense_category_id: z.string().uuid().optional(),
      const id = await resolveExpenseCategoryId(client, {});
      return { categoryNotInEntityCatalog: true as const };
      await columnExists(client, "accounting", "expense_lines", "expense_category_uuid")
    `,
    // ACCT-F4431380 (9e): the good puller fixture is the refusing shape (no native expense write).
    puller: `export async function projectPurchasesToExpenses(id: string) { return refuseQboNativeWrite("x", ["accounting.expenses"], id); }`,
    twoSection: `await resolveExpenseCategoryById(client, {})`,
  };

  if (collectFailures(good).length) {
    console.error(`${LABEL} SELFTEST FAILED — good fixture rejected:`);
    for (const f of collectFailures(good)) console.error(`  - ${f}`);
    process.exit(1);
  }

  const singleColumnFk = {
    ...good,
    migration: good.migration.replace(
      /FOREIGN KEY \(operating_company_id, expense_category_uuid\)[\s\S]*?REFERENCES catalogs\.expense_categories \(operating_company_id, id\);/,
      "FOREIGN KEY (expense_category_uuid) REFERENCES catalogs.expense_categories (id);"
    ),
  };
  if (!collectFailures(singleColumnFk).some((f) => f.includes("SAME-ENTITY composite"))) {
    console.error(`${LABEL} SELFTEST FAILED — a cross-entity single-column FK was not caught`);
    process.exit(1);
  }

  const silentDrop = { ...good, routes: good.routes.replace("return { categoryNotInEntityCatalog: true as const };", "") };
  if (!collectFailures(silentDrop).some((f) => f.includes("silently dropped"))) {
    console.error(`${LABEL} SELFTEST FAILED — a silently dropped category was not caught`);
    process.exit(1);
  }

  // ACCT-F4431380 (9e) — OLD plant: an ambiguous category stamp in the projection. NEW plants: a re-added
  // native expense_lines write in the REAL puller, and the REAL puller with its refusal reverted.
  const realPuller = fs.readFileSync(path.join(ROOT, PURCHASES_PULLER), "utf8");
  if (collectFailures({ ...good, puller: realPuller }).length) {
    console.error(`${LABEL} SELFTEST FAILED — the real refusing puller was rejected`);
    process.exit(1);
  }
  const nativeWrite = { ...good, puller: realPuller + "\nconst P = `INSERT INTO accounting.expense_lines (expense_category_uuid) VALUES ($1)`;\n" };
  if (!collectFailures(nativeWrite).some((f) => f.includes("must not write accounting.expenses"))) {
    console.error(`${LABEL} SELFTEST FAILED — a native expense_lines write in the QBO puller was not caught`);
    process.exit(1);
  }
  const noRefusal = { ...good, puller: realPuller.split("refuseQboNativeWrite(").join("noop(") };
  if (!collectFailures(noRefusal).some((f) => f.includes("refuse by name"))) {
    console.error(`${LABEL} SELFTEST FAILED — a reverted refusal was not caught`);
    process.exit(1);
  }

  console.log(`${LABEL}: selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const failures = [];
const files = {
  migration: read(MIGRATION, failures),
  resolver: read(RESOLVER, failures),
  routes: read(EXPENSES_ROUTES, failures) + "\n" + read("apps/backend/src/accounting/expense-writer.service.ts", failures), /* 443.130 #3 — old: expenses.routes.ts alone; new: + expense-writer.service.ts; why: createExpenseInClientTx moved there (service may not import a route) */
  puller: read(PURCHASES_PULLER, failures),
  twoSection: read(TWO_SECTION, failures),
};
failures.push(...collectFailures(files));

if (failures.length) {
  console.error(`${LABEL}: FAIL`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — expense_lines -> catalogs.expense_categories same-entity FK declared and writers entity-scoped`);
process.exit(0);
