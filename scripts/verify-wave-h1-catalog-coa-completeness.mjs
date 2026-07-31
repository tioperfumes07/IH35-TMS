#!/usr/bin/env node
/**
 * WAVE-H1 — CLS-ECON-EMPTY completeness (owner lock 2026-07-31).
 *
 * Static: Bill Section A + Create Advance read the right catalogs; cash_advance_types seed
 * migration present; CoA admin stays on accounting.chart_of_accounts_roles (not legacy bindings).
 *
 * Live (DATABASE_URL): ENTITY-SCOPED reads via SET app.operating_company_id (NOT bypass-0 alone —
 * catalogs.expense_categories masks to 0 under lucia-only). Required CoA roles from
 * entity-required-roles.ts must be bound to same-opco accounts; critical catalogs non-empty.
 *
 * Mutation-tested both directions (--selftest).
 */
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { fileURLToPath } from "node:url";

dotenv.config();

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-wave-h1-catalog-coa-completeness";
const SELFTEST = process.argv.includes("--selftest");
const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;

const CORE = [
  "ar_control",
  "ap_control",
  "cash_clearing",
  "undeposited_funds",
  "revenue_default",
  "expense_default",
  "retained_earnings",
  "uncategorized_expense",
  "cash_dip",
];
const CARRIER_DRIVER = [
  "escrow_liability_default",
  "driver_pay_expense",
  "driver_payroll_clearing",
  "reimbursement_expense",
  "advance_recovery",
  "damage_recovery",
  "abandonment_chargeback_recovery",
];
const FACTORING_TRANSP = [
  "factoring_advance_liability",
  "ar_assigned_to_factor",
  "factoring_recoursed_ar",
  "default_interest_expense",
  "factor_reserve_held",
  "factor_fee_expense",
  "factor_reserve_default",
];
const LEASE_TRK = ["rental_income", "lease_receivable", "interest_income", "gain_loss_on_disposal"];
const LEASE_LESSEE = ["rent_expense"];
const PROPERTY_TAX = ["property_tax_expense", "property_tax_payable"];

function requiredRoles(code) {
  const c = String(code ?? "").toUpperCase();
  if (c === "TRK") return [...new Set([...CORE, ...LEASE_TRK, ...PROPERTY_TAX])];
  if (c === "USMCA") return [...new Set([...CORE, ...CARRIER_DRIVER, ...PROPERTY_TAX, ...LEASE_LESSEE])];
  return [...new Set([...CORE, ...CARRIER_DRIVER, ...FACTORING_TRANSP, ...PROPERTY_TAX, ...LEASE_LESSEE])];
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function fail(msg) {
  console.error(`${LABEL} FAIL: ${msg}`);
  process.exit(1);
}

export function staticChecks(sources = {}) {
  const problems = [];
  const editor = sources.editor ?? read("apps/frontend/src/components/forms/TwoSectionLineEditor.tsx");
  const advance = sources.advance ?? read("apps/frontend/src/pages/cash-advances/components/CreateAdvanceModal.tsx");
  const billLines = sources.billLines ?? read("apps/frontend/src/components/accounting/vendorBillLines.ts");
  const coaPage = sources.coaPage ?? read("apps/frontend/src/pages/accounting/CoaRolesPage.tsx");
  const migrations = fs.readdirSync(path.join(ROOT, "db/migrations"));
  const seedMig = migrations.find((f) => /wave_h1_cash_advance_types_seed\.sql$/.test(f));

  if (!/expenseCategoriesCatalogClient/.test(editor)) {
    problems.push("TwoSectionLineEditor must list catalogs.expense_categories via expenseCategoriesCatalogClient");
  }
  if (!/mode === "bill"/.test(editor) || !/expenseCategoriesQuery/.test(editor)) {
    problems.push("TwoSectionLineEditor bill mode must use expenseCategoriesQuery (not CoA-as-category)");
  }
  if (!/cashAdvanceTypesCatalogClient/.test(advance)) {
    problems.push("CreateAdvanceModal must read catalogs.cash_advance_types via cashAdvanceTypesCatalogClient");
  }
  if (/account_id: accountId, expense_category_uuid: accountId/.test(billLines)) {
    problems.push("vendorBillLines must not stamp CoA account id into expense_category_uuid");
  }
  if (!/listCoaRoles/.test(coaPage) || !/upsertCoaRole/.test(coaPage)) {
    problems.push("CoaRolesPage must keep chart_of_accounts_roles API (listCoaRoles/upsertCoaRole)");
  }
  if (!seedMig) {
    problems.push("missing db/migrations/*_wave_h1_cash_advance_types_seed.sql");
  } else {
    const sql = read(`db/migrations/${seedMig}`);
    if (!/cash_advance_types/.test(sql)) problems.push(`${seedMig} must seed cash_advance_types`);
    // Ban re-seed of other H1-out tables (word "parts" in a comment is fine).
    if (/__seed_company_catalog\(\s*'expense_categories'/.test(sql) || /__seed_company_catalog\(\s*'escrow_types'/.test(sql) || /__seed_company_catalog\(\s*'parts'/.test(sql)) {
      problems.push(`${seedMig} must NOT re-seed expense_categories/escrow_types/parts (owner lock)`);
    }
    if (/account_role_bindings/.test(sql)) {
      problems.push(`${seedMig} must NOT seed catalogs.account_role_bindings (legacy fallback only)`);
    }
  }
  return problems;
}

async function liveChecks() {
  if (!connectionString) {
    console.log(`${LABEL} PASS (static only; no DATABASE_URL for live entity-scoped density)`);
    return;
  }
  const { Pool } = pg;
  const pool = new Pool({ connectionString });
  const client = await pool.connect();
  const gaps = [];
  try {
    await client.query("BEGIN");
    // Prefer entity GUC; lucia alone false-empties some catalogs.* policies.
    await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    const companies = await client.query(
      `SELECT id::text AS id, code FROM org.companies WHERE code = ANY($1::text[]) ORDER BY code`,
      [["TRANSP", "TRK", "USMCA"]]
    );
    for (const co of companies.rows) {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [co.id]);
      for (const table of ["expense_categories", "escrow_types", "driver_deduction_types", "cash_advance_types"]) {
        const n = await client.query(
          `SELECT count(*)::int AS n FROM catalogs.${table} WHERE operating_company_id = $1::uuid AND COALESCE(is_active, true)`,
          [co.id]
        );
        if ((n.rows[0]?.n ?? 0) < 1) {
          gaps.push(`${co.code}: catalogs.${table} empty under entity-scoped read`);
        }
      }
      const required = requiredRoles(co.code);
      const bound = await client.query(
        `
          SELECT r.role, a.id IS NOT NULL AS has_account, (a.operating_company_id = r.operating_company_id) AS same_opco
          FROM accounting.chart_of_accounts_roles r
          LEFT JOIN catalogs.accounts a ON a.id = r.account_id
          WHERE r.operating_company_id = $1::uuid
            AND COALESCE(r.is_active, true)
            AND r.role = ANY($2::text[])
        `,
        [co.id, required]
      );
      const found = new Map(bound.rows.map((r) => [r.role, r]));
      for (const role of required) {
        const row = found.get(role);
        if (!row) gaps.push(`${co.code}: required CoA role unbound: ${role}`);
        else if (!row.has_account) gaps.push(`${co.code}: ${role} account_id missing`);
        else if (!row.same_opco) gaps.push(`${co.code}: ${role} account wrong-opco FK`);
      }
    }
    await client.query("ROLLBACK");
  } finally {
    client.release();
    await pool.end();
  }
  if (gaps.length) {
    fail(`live entity-scoped gaps:\n  - ${gaps.join("\n  - ")}`);
  }
  console.log(`${LABEL} PASS — live entity-scoped catalogs + required CoA roles OK`);
}

function selftest() {
  const baseline = staticChecks();
  if (baseline.length) {
    console.error(`${LABEL} SELFTEST FAIL: repo already red:\n  - ${baseline.join("\n  - ")}`);
    process.exit(1);
  }
  const editor = read("apps/frontend/src/components/forms/TwoSectionLineEditor.tsx");
  const brokenEditor = editor.replace(/expenseCategoriesCatalogClient/g, "REMOVED_CLIENT");
  const red = staticChecks({ editor: brokenEditor });
  if (!red.some((p) => /expenseCategoriesCatalogClient/.test(p))) {
    console.error(`${LABEL} SELFTEST FAIL: planted editor regression not caught`);
    process.exit(1);
  }
  const billLines = read("apps/frontend/src/components/accounting/vendorBillLines.ts");
  const brokenBill = billLines + "\naccount_id: accountId, expense_category_uuid: accountId\n";
  const redBill = staticChecks({ billLines: brokenBill });
  if (!redBill.some((p) => /expense_category_uuid/.test(p))) {
    console.error(`${LABEL} SELFTEST FAIL: planted CoA-as-category stamp not caught`);
    process.exit(1);
  }
  const green = staticChecks();
  if (green.length) {
    console.error(`${LABEL} SELFTEST FAIL: green path dirty`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — planted regressions caught; live sources clean`);
}

async function main() {
  if (SELFTEST) {
    selftest();
    return;
  }
  const problems = staticChecks();
  if (problems.length) fail(problems.join("; "));
  console.log(`${LABEL} PASS — static wiring + seed migration`);
  await liveChecks();
}

main().catch((err) => {
  console.error(`${LABEL} FAIL: ${err?.stack || err}`);
  process.exit(1);
});
