#!/usr/bin/env node
/**
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

  if (!/expense_category_uuid/.test(puller)) {
    failures.push(`${PURCHASES_PULLER}: QBO expense projection must stamp expense_category_uuid when it is knowable`);
  }
  if (!/WHEN ecm\.matches = 1/.test(puller)) {
    failures.push(
      `${PURCHASES_PULLER}: the projection may only stamp a category when exactly one active category binds the account`
    );
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
    puller: `expense_category_uuid, CASE WHEN ecm.matches = 1 THEN ecm.id END`,
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

  const guessingProjection = { ...good, puller: "expense_category_uuid, ecm.id" };
  if (!collectFailures(guessingProjection).some((f) => f.includes("exactly one active category"))) {
    console.error(`${LABEL} SELFTEST FAILED — an ambiguous projection stamp was not caught`);
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
  routes: read(EXPENSES_ROUTES, failures),
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
