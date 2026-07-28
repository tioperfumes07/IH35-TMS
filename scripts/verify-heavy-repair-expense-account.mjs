#!/usr/bin/env node
/**
 * ND-FA-01 / A4-D2 — Heavy Repair Expense CoA seed + heavy_repair_expense role.
 *
 * Modes: default static · --selftest · --live (DATABASE_URL + lucia)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-heavy-repair-expense-account";
const MIGRATION = "db/migrations/202610060000_nd_fa_heavy_repair_expense_coa.sql";
const RESOLVER = "apps/backend/src/accounting/coa-roles/resolver.service.ts";
const THRESHOLD = "apps/backend/src/accounting/capitalize-threshold.ts";

export function assertArtifacts(root = ROOT) {
  const problems = [];
  const migPath = path.join(root, MIGRATION);
  if (!fs.existsSync(migPath)) return [`missing ${MIGRATION}`];
  const mig = fs.readFileSync(migPath, "utf8");
  for (const needle of [
    "Heavy Repair Expense",
    "6150",
    "heavy_repair_expense",
    "VehicleRepairs",
    "unbilled_revenue",
    "fixed_asset_default",
    "DO NOT RUN ON PROD",
  ]) {
    if (!mig.includes(needle)) problems.push(`migration missing: ${needle}`);
  }
  const resolver = fs.readFileSync(path.join(root, RESOLVER), "utf8");
  if (!/"heavy_repair_expense"/.test(resolver)) {
    problems.push("COA_ROLE_VALUES must include heavy_repair_expense");
  }
  const thr = fs.readFileSync(path.join(root, THRESHOLD), "utf8");
  if (!/HEAVY_REPAIR_EXPENSE_COA_ROLE\s*=\s*"heavy_repair_expense"/.test(thr)) {
    problems.push("capitalize-threshold must export HEAVY_REPAIR_EXPENSE_COA_ROLE");
  }
  if (!/A4-D2/.test(thr)) problems.push("capitalize-threshold must cite A4-D2");
  return problems;
}

export function findLiveProblems(rows) {
  const problems = [];
  const byCo = new Map();
  for (const r of rows) byCo.set(r.code, r);
  for (const code of ["TRANSP", "TRK", "USMCA"]) {
    const r = byCo.get(code);
    if (!r) {
      problems.push(`${code}: missing Heavy Repair Expense account`);
      continue;
    }
    if (String(r.account_type) !== "OtherExpense") {
      problems.push(`${code}: account_type=${r.account_type} — must be OtherExpense`);
    }
    if (r.is_postable !== true && r.is_postable !== "t") {
      problems.push(`${code}: is_postable must be true`);
    }
    if (r.system_purpose !== "heavy_repair_expense") {
      problems.push(`${code}: system_purpose=${r.system_purpose}`);
    }
    if (r.role_bound !== true && r.role_bound !== "t") {
      problems.push(`${code}: heavy_repair_expense role not bound`);
    }
  }
  return problems;
}

function selftest() {
  const goodRoot = fs.mkdtempSync(path.join(ROOT, ".tmp-heavy-repair-"));
  try {
    fs.mkdirSync(path.join(goodRoot, "db/migrations"), { recursive: true });
    fs.mkdirSync(path.join(goodRoot, "apps/backend/src/accounting/coa-roles"), { recursive: true });
    fs.writeFileSync(
      path.join(goodRoot, MIGRATION),
      [
        "DO NOT RUN ON PROD",
        "Heavy Repair Expense",
        "6150",
        "heavy_repair_expense",
        "VehicleRepairs",
        "unbilled_revenue",
        "fixed_asset_default",
      ].join("\n")
    );
    fs.writeFileSync(path.join(goodRoot, RESOLVER), 'export const COA_ROLE_VALUES = ["heavy_repair_expense"]');
    fs.writeFileSync(
      path.join(goodRoot, THRESHOLD),
      'export const HEAVY_REPAIR_EXPENSE_COA_ROLE = "heavy_repair_expense"; // A4-D2'
    );
    if (assertArtifacts(goodRoot).length) {
      console.error(`${LABEL} --selftest FAIL good`, assertArtifacts(goodRoot));
      process.exit(1);
    }
    const liveBad = findLiveProblems([]);
    if (!liveBad.some((e) => e.includes("TRANSP"))) {
      console.error(`${LABEL} --selftest FAIL live empty not caught`);
      process.exit(1);
    }
    console.log(`${LABEL}: selftest PASS`);
  } finally {
    fs.rmSync(goodRoot, { recursive: true, force: true });
  }
}

async function liveProbe() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log(`${LABEL}: LIVE skipped (no DATABASE_URL) — static only`);
    return;
  }
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
    const { rows } = await client.query(`
      SELECT oc.code,
             a.account_name,
             a.account_type,
             a.system_purpose,
             a.is_postable,
             EXISTS (
               SELECT 1 FROM accounting.chart_of_accounts_roles r
               WHERE r.operating_company_id = a.operating_company_id
                 AND r.role = 'heavy_repair_expense'
                 AND r.is_active
                 AND r.account_id = a.id
             ) AS role_bound
      FROM catalogs.accounts a
      JOIN org.companies oc ON oc.id = a.operating_company_id
      WHERE a.deactivated_at IS NULL
        AND (
          a.system_purpose = 'heavy_repair_expense'
          OR a.account_name = 'Heavy Repair Expense'
          OR a.account_number = '6150'
        )
    `);
    const problems = findLiveProblems(rows);
    if (problems.length) {
      console.error(`${LABEL}: LIVE FAIL`);
      for (const p of problems) console.error(`  - ${p}`);
      process.exit(1);
    }
    console.log(`${LABEL}: LIVE PASS — Heavy Repair Expense bound on TRANSP/TRK/USMCA`);
  } finally {
    await client.end();
  }
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const problems = assertArtifacts();
if (problems.length) {
  console.error(`${LABEL}: FAIL`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — Heavy Repair Expense migration + role pinned`);

if (process.argv.includes("--live")) {
  await liveProbe();
}
process.exit(0);
