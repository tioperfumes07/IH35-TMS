#!/usr/bin/env node
/**
 * LV-LIST-SAMPLE-TAG-IN-NAME-ONLY — Gate-B purge predicate
 *
 * Verifies that `scripts/gate-b-purge-predicate.sql` exists and is a single,
 * tag-based predicate that finds Gate-B sample rows across the five document
 * families while excluding real (untagged, non-sample) rows.
 *
 * Run: node scripts/verify-gate-b-purge-predicate.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SQL_FILE = "scripts/gate-b-purge-predicate.sql";
const CATALOG_CREATORS = [
  "apps/backend/src/catalogs/accounting/factory.ts",
  "apps/backend/src/catalogs/payment-terms.routes.ts",
  "apps/backend/src/catalogs/classes.routes.ts",
];
const LABEL = "verify-gate-b-purge-predicate";

const REQUIRED_TABLES = [
  "accounting.invoices",
  "accounting.payments",
  "accounting.bill_payments",
  "accounting.bills",
  "accounting.journal_entries",
  "accounting.expenses",
  "driver_finance.settlement_lines",
  "driver_finance.driver_settlements",
  "catalogs.accounts",
  "catalogs.items",
];

const OPTIONAL_MASTER_DATA = [
  "mdata.customers",
  "mdata.vendors",
  "mdata.drivers",
  "mdata.units",
  "mdata.loads",
];

const TAG_PATTERN = /USMCA_GATEB_SAMPLE_[%\d{4}-\d{2}-\d{2}]/;
const LEGACY_BILL_PATTERN = /CASCADE-GATEB-%/;

export function assertCatalogCreators(creators) {
  const errors = [];
  for (const [relPath, src] of Object.entries(creators)) {
    if (!/resolveCatalogDescriptionFromName/.test(src)) {
      errors.push(`${relPath}: does not use resolveCatalogDescriptionFromName`);
      continue;
    }
    if (!/resolvedNotes/.test(src) && !/resolvedDescription/.test(src)) {
      errors.push(`${relPath}: does not apply resolved tag to notes/description on create`);
    }
  }
  return errors;
}

export function assertPredicate(sql) {
  const errors = [];
  const lower = sql.toLowerCase();

  if (!lower.includes("is_sample_data is true") && !lower.includes("is_sample_data = true")) {
    errors.push(`${SQL_FILE}: predicate does not use is_sample_data=true`);
  }
  if (!sql.includes("USMCA_GATEB_SAMPLE_")) {
    errors.push(`${SQL_FILE}: predicate does not reference the canonical Gate-B tag`);
  }
  if (!/ILIKE\s+['"]%USMCA_GATEB_SAMPLE_%['"]/i.test(sql)) {
    errors.push(`${SQL_FILE}: predicate does not use a case-insensitive wildcard search for the tag`);
  }

  for (const t of REQUIRED_TABLES) {
    if (!sql.includes(t)) {
      errors.push(`${SQL_FILE}: missing required table ${t}`);
    }
  }

  // The predicate must be scoped to a single operating company so it never
  // purges across entities by accident.
  if (!/operating_company_id\s*=/.test(sql)) {
    errors.push(`${SQL_FILE}: predicate is not scoped to operating_company_id`);
  }

  // It must NOT fall back to a time-window that would catch real rows.
  if (/created_at\s*(BETWEEN|>=|<=|>|<)/i.test(sql) || /DATE_TRUNC.*created_at/i.test(sql)) {
    errors.push(`${SQL_FILE}: predicate must not rely on created_at time windows`);
  }

  // It must NOT select every row without a tag check.
  if (/SELECT\s+\*\s+FROM\s+accounting\.bills\s+WHERE\s+1\s*=\s*1/i.test(sql)) {
    errors.push(`${SQL_FILE}: predicate has an unconditional all-rows branch`);
  }

  return errors;
}

function selftest() {
  const good = `
WITH s AS (
  SELECT 'accounting.invoices' AS table_name, id, operating_company_id
  FROM accounting.invoices
  WHERE internal_notes ILIKE '%USMCA_GATEB_SAMPLE_%' OR (is_sample_data IS TRUE)
  UNION ALL
  SELECT 'accounting.payments', id, operating_company_id FROM accounting.payments
  WHERE reference ILIKE '%USMCA_GATEB_SAMPLE_%' OR (is_sample_data IS TRUE)
  UNION ALL
  SELECT 'accounting.bill_payments', id, operating_company_id FROM accounting.bill_payments
  WHERE memo ILIKE '%USMCA_GATEB_SAMPLE_%' OR (is_sample_data IS TRUE)
  UNION ALL
  SELECT 'accounting.bills', id, operating_company_id FROM accounting.bills
  WHERE memo ILIKE '%USMCA_GATEB_SAMPLE_%' OR bill_number ILIKE 'CASCADE-GATEB-%' OR (is_sample_data IS TRUE)
  UNION ALL
  SELECT 'accounting.journal_entries', id, operating_company_id FROM accounting.journal_entries
  WHERE COALESCE(description, memo) ILIKE '%USMCA_GATEB_SAMPLE_%' OR (is_sample_data IS TRUE)
  UNION ALL
  SELECT 'accounting.expenses', id, operating_company_id FROM accounting.expenses
  WHERE memo ILIKE '%USMCA_GATEB_SAMPLE_%' OR (is_sample_data IS TRUE)
  UNION ALL
  SELECT 'driver_finance.settlement_lines', id, operating_company_id FROM driver_finance.settlement_lines
  WHERE description ILIKE '%USMCA_GATEB_SAMPLE_%' OR (is_sample_data IS TRUE)
  UNION ALL
  SELECT 'driver_finance.driver_settlements', id, operating_company_id FROM driver_finance.driver_settlements
  WHERE (is_sample_data IS TRUE)
  UNION ALL
  SELECT 'catalogs.accounts', id, operating_company_id FROM catalogs.accounts
  WHERE notes ILIKE '%USMCA_GATEB_SAMPLE_%' OR account_name ILIKE '%USMCA_GATEB_SAMPLE_%'
  UNION ALL
  SELECT 'catalogs.items', id, operating_company_id FROM catalogs.items
  WHERE description ILIKE '%USMCA_GATEB_SAMPLE_%' OR item_name ILIKE '%USMCA_GATEB_SAMPLE_%'
)
SELECT * FROM s WHERE operating_company_id = $1::uuid;
`;
  const bad = good.replace("USMCA_GATEB_SAMPLE_%", "created_at > NOW() - INTERVAL '7 days'");
  const cases = [
    { n: "complete predicate → 0", sql: good, want: 0 },
    { n: "time-window fallback → ≥1", sql: bad, min: 1 },
  ];
  let failed = 0;
  for (const c of cases) {
    const n = assertPredicate(c.sql).length;
    const ok = c.want !== undefined ? n === c.want : n >= c.min;
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"}  ${c.n}  (errors=${n})`);
  }
  if (failed) {
    console.error(`\n${LABEL} SELFTEST FAILED: ${failed}`);
    process.exit(1);
  }
  console.log(`\n${LABEL} SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const p = path.join(ROOT, SQL_FILE);
if (!fs.existsSync(p)) {
  console.error(`[${LABEL}] FAILED — ${SQL_FILE} not found`);
  process.exit(1);
}

const creators = Object.fromEntries(
  CATALOG_CREATORS.map((rel) => [rel, fs.readFileSync(path.join(ROOT, rel), "utf8")])
);
const errors = [
  ...assertPredicate(fs.readFileSync(p, "utf8")),
  ...assertCatalogCreators(creators),
];
if (errors.length) {
  console.error(`[${LABEL}] FAILED — ${errors.length} issue(s):`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — ${SQL_FILE} is a tag-based, entity-scoped Gate-B purge predicate covering the required document tables.`);
