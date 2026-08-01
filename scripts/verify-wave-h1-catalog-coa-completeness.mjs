#!/usr/bin/env node
/**
 * WAVE-H1 — CLS-ECON-EMPTY completeness (owner lock 2026-07-31).
 *
 * Static: Bill Section A + Create Advance read the right catalogs; CoA admin stays on
 * accounting.chart_of_accounts_roles (not legacy bindings). MUST NOT ship a re-seed migration for
 * already-populated catalogs (owner lock after #3934 RLS fix — wire, don't seed).
 *
 * Live (DATABASE_URL): ENTITY-SCOPED reads via SET app.operating_company_id (+ lucia bypass after
 * CAT-RLS-BYPASS-01). Required CoA roles from entity-required-roles.ts must be bound to same-opco
 * accounts; critical catalogs non-empty.
 *
 * Mutation-tested both directions (--selftest).
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
try {
  require("dotenv").config();
} catch {
  /* optional — CI/live use process.env */
}
let pg;
try {
  pg = require("pg");
} catch {
  pg = null;
}

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

/** Mirrors OPTIONAL_COA_ROLES in entity-required-roles.ts (must stay non-required). */
const OPTIONAL_ROLES = [
  "sales_tax_payable",
  "cash_basis_adjustment_equity",
  "lease_recovery",
  "insurance_recovery",
  "fuel_advance_recovery",
  "other_recovery",
  // Fixed-asset defaults — deferred until ND-FA-01 depreciation go-live (not TRK-required now).
  "fixed_asset_default",
  "accum_depr_default",
  "depr_expense_default",
];

function requiredRoles(code) {
  const c = String(code ?? "").toUpperCase();
  if (c === "TRK") return [...new Set([...CORE, ...LEASE_TRK, ...PROPERTY_TAX])];
  if (c === "USMCA") return [...new Set([...CORE, ...CARRIER_DRIVER, ...PROPERTY_TAX, ...LEASE_LESSEE])];
  return [...new Set([...CORE, ...CARRIER_DRIVER, ...FACTORING_TRANSP, ...PROPERTY_TAX, ...LEASE_LESSEE])];
}

/**
 * Active binding only. A required role with ONLY is_active=false rows is UNBOUND
 * (row existence must not pass — hides TRK accum_depr-style latent gaps).
 */
export function activeBindingCoversRole(rows, role) {
  return rows.some(
    (r) =>
      r.role === role &&
      r.is_active !== false &&
      r.has_account === true &&
      r.same_opco === true
  );
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
  const bannedSeed = migrations.find((f) => /wave_h1_cash_advance_types_seed\.sql$/.test(f));
  if (bannedSeed) {
    problems.push(
      `${bannedSeed} must NOT ship — cash_advance_types already seeded (18); H1 wires only (owner lock post-#3934)`
    );
  }

  if (!/expenseCategoriesCatalogClient/.test(editor)) {
    problems.push("TwoSectionLineEditor must list catalogs.expense_categories via expenseCategoriesCatalogClient");
  }
  if (!/mode === "bill"/.test(editor) || !/expenseCategoriesQuery/.test(editor)) {
    problems.push("TwoSectionLineEditor bill mode must use expenseCategoriesQuery (not CoA-as-category)");
  }
  if (!/categoryCreateKind=\{mode === "bill" \? "expense_category" : "category"\}/.test(editor)) {
    problems.push('Bill mode +Create must use createKind expense_category (not CoA category)');
  }
  const registry = sources.registry ?? read("apps/frontend/src/components/parity/catalogPickerRegistry.ts");
  if (!/expense_category:\s*catalogEntry/.test(registry) || !/catalogs\.expense_categories/.test(registry)) {
    problems.push("catalogPickerRegistry must define expense_category → catalogs.expense_categories");
  }
  // Permanent: verify-lst-picker-config-driven requires evidence:"…:NNN" — without :line CI fails late.
  const expenseCatBlock = registry.match(/expense_category:\s*catalogEntry\(\{[\s\S]*?\n\s*\}\),/);
  if (!expenseCatBlock || !/evidence:\s*"([^"]*:\d+[^"]*)"/.test(expenseCatBlock[0])) {
    problems.push(
      'expense_category registry evidence must cite backend file:line (e.g. accounting/index.ts:328) for read===write',
    );
  }
  const coaApi = sources.coaApi ?? read("apps/frontend/src/api/accounting.ts");
  for (const role of ["rent_expense", "fuel_overage_receivable", "broker_customer_advance_liability"]) {
    if (!new RegExp(`"${role}"`).test(coaApi)) {
      problems.push(`FE COA_ROLE_VALUES missing ${role}`);
    }
  }
  if (!/cashAdvanceTypesCatalogClient/.test(advance)) {
    problems.push("CreateAdvanceModal must read catalogs.cash_advance_types via cashAdvanceTypesCatalogClient");
  }
  // Permanent: naked String(selectedBill.display_id) regenerates entity-link-adoption drift (step 930).
  if (!/EntityLink/.test(advance) || !/<EntityLink[\s\S]{0,120}kind=["']bill["']/.test(advance)) {
    problems.push('CreateAdvanceModal selected-bill summary must use <EntityLink kind="bill" …>');
  }
  if (/Selected \{String\(selectedBill\.display_id\)\}/.test(advance)) {
    problems.push("CreateAdvanceModal must not render naked Selected {String(selectedBill.display_id)}");
  }
  if (/account_id: accountId, expense_category_uuid: accountId/.test(billLines)) {
    problems.push("vendorBillLines must not stamp CoA account id into expense_category_uuid");
  }
  if (!/listCoaRoles/.test(coaPage) || !/upsertCoaRole/.test(coaPage)) {
    problems.push("CoaRolesPage must keep chart_of_accounts_roles API (listCoaRoles/upsertCoaRole)");
  }
  const entityRoles = sources.entityRoles ?? read("apps/backend/src/accounting/coa-roles/entity-required-roles.ts");
  if (!/accum_depr_default/.test(entityRoles) || !/OPTIONAL_COA_ROLES/.test(entityRoles)) {
    problems.push("entity-required-roles.ts must keep accum_depr_default in OPTIONAL_COA_ROLES (ND-FA-01 deferral)");
  }
  const trkRequired = new Set(requiredRoles("TRK"));
  for (const opt of OPTIONAL_ROLES) {
    if (trkRequired.has(opt)) {
      problems.push(`TRK required set must not include optional role ${opt}`);
    }
  }
  if (trkRequired.has("accum_depr_default")) {
    problems.push("accum_depr_default must not be TRK-required until ND-FA-01 depreciation go-live");
  }
  return problems;
}

async function liveChecks() {
  if (!connectionString || !pg) {
    console.log(`${LABEL} PASS (static only; no DATABASE_URL/pg for live entity-scoped density)`);
    return;
  }
  // CI fixture DBs do not carry seeded chart_of_accounts_roles; live density is Neon-only.
  // Static checks remain the hard gate. Do not weaken the catalog wire.
  const isNeon = /neon\.tech|\.neon\./i.test(connectionString);
  const isCI = process.env.CI === "true" || process.env.CI === "1";
  if (!isNeon || isCI) {
    console.log(`${LABEL} PASS (live skipped — DATABASE_URL is not a production Neon URL or CI is set; static wiring remains enforced)`);
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
      // Load ALL bindings for required roles (including inactive). Coverage uses activeBindingCoversRole
      // so is_active=false-only rows count as UNBOUND — not mere row existence.
      const bound = await client.query(
        `
          SELECT r.role,
                 COALESCE(r.is_active, true) AS is_active,
                 a.id IS NOT NULL AS has_account,
                 (a.operating_company_id = r.operating_company_id) AS same_opco
          FROM accounting.chart_of_accounts_roles r
          LEFT JOIN catalogs.accounts a ON a.id = r.account_id
          WHERE r.operating_company_id = $1::uuid
            AND r.role = ANY($2::text[])
        `,
        [co.id, required]
      );
      for (const role of required) {
        const rows = bound.rows.filter((r) => r.role === role);
        if (!activeBindingCoversRole(rows, role)) {
          const onlyInactive = rows.length > 0 && rows.every((r) => r.is_active === false);
          gaps.push(
            onlyInactive
              ? `${co.code}: required CoA role unbound (only inactive binding): ${role}`
              : `${co.code}: required CoA role unbound: ${role}`
          );
        }
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
  const registry = read("apps/frontend/src/components/parity/catalogPickerRegistry.ts");
  const brokenEvidence = registry.replace(
    /expense_category:\s*catalogEntry\(\{[\s\S]*?\n\s*\}\),/,
    (block) => block.replace(/evidence:\s*"[^"]*"/, 'evidence: "apps/backend/src/catalogs/accounting/index.ts tableName expense_categories"'),
  );
  const redEvidence = staticChecks({ registry: brokenEvidence });
  if (!redEvidence.some((p) => /file:line|evidence must cite/.test(p))) {
    console.error(`${LABEL} SELFTEST FAIL: planted missing :line evidence not caught`);
    process.exit(1);
  }
  const advance = read("apps/frontend/src/pages/cash-advances/components/CreateAdvanceModal.tsx");
  const nakedBill = advance
    .replace(/import\s*\{\s*EntityLink\s*\}\s*from\s*["'][^"']+["'];?\n?/, "")
    .replace(
      /Selected\s*<EntityLink[\s\S]*?\/>\s*—/,
      "Selected {String(selectedBill.display_id)} —",
    );
  const redAdvance = staticChecks({ advance: nakedBill });
  if (!redAdvance.some((p) => /EntityLink|naked Selected/.test(p))) {
    console.error(`${LABEL} SELFTEST FAIL: planted naked selectedBill.display_id not caught`);
    process.exit(1);
  }
  const green = staticChecks();
  if (green.length) {
    console.error(`${LABEL} SELFTEST FAIL: green path dirty`);
    process.exit(1);
  }
  // Inactive-only binding must NOT satisfy required coverage (blind-spot regression).
  const inactiveOnly = [
    { role: "ar_control", is_active: false, has_account: true, same_opco: true },
  ];
  if (activeBindingCoversRole(inactiveOnly, "ar_control")) {
    console.error(`${LABEL} SELFTEST FAIL: inactive-only binding incorrectly treated as bound`);
    process.exit(1);
  }
  const activeOk = [
    { role: "ar_control", is_active: true, has_account: true, same_opco: true },
  ];
  if (!activeBindingCoversRole(activeOk, "ar_control")) {
    console.error(`${LABEL} SELFTEST FAIL: active binding should cover role`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — planted regressions caught; inactive≠bound; live sources clean`);
}

async function main() {
  if (SELFTEST) {
    selftest();
    return;
  }
  const problems = staticChecks();
  if (problems.length) fail(problems.join("; "));
  console.log(`${LABEL} PASS — static wiring (no re-seed)`);
  await liveChecks();
}

main().catch((err) => {
  console.error(`${LABEL} FAIL: ${err?.stack || err}`);
  process.exit(1);
});
