#!/usr/bin/env node
// ROUND 321 (CC-1) — lease-to-own money side, ASC 842 LESSEE schedule (migration 202615210000).
// static: the migration ships the schedule table with FORCE RLS + the canonical WORM trigger and admits the 4 lessee COA
//         roles; the roles are registered in the backend resolver AND the frontend CoaRoles enum (owner binds them in
//         the app); the table is classified in verify-transaction-linkage-law's TABLE_REGISTRY; classification follows
//         the owner's B1 rule (fixed purchase price -> finance, FMV / none -> operating).
// live (read-only, FAIL-CLOSED without DATABASE_URL): before the migration is applied it says PENDING-APPLY by name;
//         after: FORCE RLS + WORM on the table, every capitalized contract carries a classification consistent with
//         its purchase option, each asset line's active schedule is contiguous from period 1, every row ties
//         (DB CHECK), and the last period closes the liability at the fixed purchase price (finance) or zero.
import { readFileSync, existsSync } from "node:fs";
import { requireLiveDbOrExit } from "../lib/require-live-db.mjs";

const LABEL = "verify-lease-to-own-schedule";
const ROOT = new URL("../../", import.meta.url);
const read = (p) => (existsSync(new URL(p, ROOT)) ? readFileSync(new URL(p, ROOT), "utf8") : "");
const F = {
  mig: "db/migrations/202615210000_lease_to_own_lessee_asc842.sql",
  math: "apps/backend/src/leases/lessee-schedule.ts",
  be: "apps/backend/src/accounting/coa-roles/resolver.service.ts",
  fe: "apps/frontend/src/api/accounting.ts",
  feLabels: "apps/frontend/src/pages/accounting/CoaRolesPage.tsx",
  law: "scripts/verify-transaction-linkage-law.mjs",
};
const ROLES = ["rou_asset", "lease_liability", "accumulated_rou_amortization", "lease_interest_expense"];

export function staticProblems(src) {
  const p = [];
  if (!src.mig) return [`${F.mig} missing`];
  if (!/CREATE TABLE IF NOT EXISTS accounting\.lease_lessee_schedule_period/.test(src.mig)) p.push("migration does not create accounting.lease_lessee_schedule_period");
  if (!/ALTER TABLE accounting\.lease_lessee_schedule_period FORCE ROW LEVEL SECURITY/.test(src.mig)) p.push("schedule table must FORCE RLS");
  if (!/CREATE TRIGGER trg_worm_refuse_delete BEFORE DELETE ON accounting\.lease_lessee_schedule_period[\s\S]{0,120}refuse_financial_row_delete/.test(src.mig)) p.push("schedule table must ship the canonical WORM trigger");
  if (!/liability_close_cents = liability_open_cents - principal_cents AND principal_cents = payment_cents - interest_cents/.test(src.mig)) p.push("schedule rows must tie by CHECK");
  for (const r of ROLES) {
    if (!src.mig.includes(`'${r}'`)) p.push(`migration role CHECK does not admit ${r}`);
    if (!src.be.includes(`"${r}",`)) p.push(`backend COA_ROLE_VALUES missing ${r}`);
    if (!src.fe.includes(`"${r}",`)) p.push(`frontend CoaRoles enum missing ${r} (owner could not bind it)`);
    if (!new RegExp(`\\b${r}: "`).test(src.feLabels)) p.push(`CoaRolesPage label missing ${r}`);
  }
  if (!/"accounting\.lease_lessee_schedule_period": \{ status:/.test(src.law)) p.push("schedule table not classified in TABLE_REGISTRY (verify-transaction-linkage-law)");
  if (!/return kind === "fixed" \? "finance" : "operating";/.test(src.math)) p.push("classifyLessee must follow the owner B1 rule (fixed -> finance, else operating)");
  return p;
}

const src = Object.fromEntries(Object.entries(F).map(([k, v]) => [k, read(v)]));
const own = staticProblems(src);
if (own.length) {
  console.error(`${LABEL}: STATIC FAIL — ${own.join("; ")}`);
  process.exit(1);
}
// selftest plants
const plants = [
  ["no FORCE RLS", { ...src, mig: src.mig.replace("FORCE ROW LEVEL SECURITY", "NO FORCE") }],
  ["role missing in FE", { ...src, fe: src.fe.replace('"lease_liability",', "") }],
  ["unregistered table", { ...src, law: src.law.replace('"accounting.lease_lessee_schedule_period"', '"x"') }],
  ["wrong classification", { ...src, math: src.math.replace('kind === "fixed" ? "finance" : "operating"', 'kind === "fmv" ? "finance" : "operating"') }],
];
for (const [name, planted] of plants) {
  if (!staticProblems(planted).length) {
    console.error(`${LABEL} --selftest FAIL — plant "${name}" not caught`);
    process.exit(1);
  }
}
console.log(`${LABEL} --selftest PASS (static clean; ${plants.length}/${plants.length} plants caught)`);
if (process.argv.includes("--selftest")) process.exit(0);

const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
try {
  await client.query("BEGIN READ ONLY");
  await client.query("SET LOCAL app.bypass_rls = 'lucia'");
  const exists = (await client.query(`SELECT to_regclass('accounting.lease_lessee_schedule_period') IS NOT NULL AS ok`)).rows[0].ok;
  if (!exists) {
    await client.query("ROLLBACK");
    console.log(`${LABEL}: LIVE PENDING-APPLY — migration 202615210000 not applied on this database yet (static PASS); the live checks run once it is.`);
    process.exit(0);
  }
  const meta = (await client.query(
    `SELECT c.relforcerowsecurity AS forced,
            EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid = c.oid AND t.tgname = 'trg_worm_refuse_delete' AND NOT t.tgisinternal) AS worm
       FROM pg_class c WHERE c.oid = 'accounting.lease_lessee_schedule_period'::regclass`
  )).rows[0];
  const badClass = (await client.query(
    `SELECT id::text, display_id, purchase_option_kind, lessee_classification FROM accounting.lease_contract
      WHERE lessee_classification IS NOT NULL AND voided_at IS NULL
        AND lessee_classification <> CASE WHEN purchase_option_kind = 'fixed' THEN 'finance' ELSE 'operating' END`
  )).rows;
  const gaps = (await client.query(
    `SELECT lease_asset_line_id::text, count(*)::int n, max(period_no) mx, min(period_no) mn
       FROM accounting.lease_lessee_schedule_period WHERE voided_at IS NULL
      GROUP BY 1 HAVING min(period_no) <> 1 OR max(period_no) <> count(*)`
  )).rows;
  const badClose = (await client.query(
    `SELECT s.lease_asset_line_id::text, s.liability_close_cents, lc.purchase_option_kind, lc.purchase_option_price_cents, lc.lessee_classification
       FROM accounting.lease_lessee_schedule_period s
       JOIN accounting.lease_contract lc ON lc.id = s.lease_contract_id
      WHERE s.voided_at IS NULL AND s.period_no = (SELECT max(period_no) FROM accounting.lease_lessee_schedule_period x WHERE x.lease_asset_line_id = s.lease_asset_line_id AND x.voided_at IS NULL)
        AND lc.end_date IS NOT NULL
        AND s.liability_close_cents <> CASE WHEN lc.lessee_classification = 'finance' THEN COALESCE(lc.purchase_option_price_cents, 0) ELSE 0 END
        AND (SELECT count(*) FROM accounting.lease_asset_line a WHERE a.lease_contract_id = lc.id AND a.is_active) = 1`
  )).rows;
  const counts = (await client.query(
    `SELECT (SELECT count(*)::int FROM accounting.lease_contract WHERE lessee_classification IS NOT NULL AND voided_at IS NULL) contracts,
            (SELECT count(*)::int FROM accounting.lease_lessee_schedule_period WHERE voided_at IS NULL) rows`
  )).rows[0];
  await client.query("ROLLBACK");
  const problems = [];
  if (!meta.forced) problems.push("accounting.lease_lessee_schedule_period is not FORCE RLS");
  if (!meta.worm) problems.push("accounting.lease_lessee_schedule_period has no trg_worm_refuse_delete");
  if (badClass.length) problems.push(`${badClass.length} contract(s) classified against the B1 rule: ${badClass.map((r) => `${r.display_id ?? r.id} ${r.purchase_option_kind}->${r.lessee_classification}`).join(", ")}`);
  if (gaps.length) problems.push(`${gaps.length} asset line(s) with a non-contiguous schedule`);
  if (badClose.length) problems.push(`${badClose.length} single-asset schedule(s) whose last period does not close at the purchase price / zero`);
  if (problems.length) {
    console.error(`${LABEL}: LIVE FAIL — ${problems.join("; ")}`);
    process.exit(1);
  }
  console.log(`${LABEL}: LIVE PASS — FORCE RLS + WORM on the schedule; ${counts.contracts} capitalized contract(s), ${counts.rows} schedule row(s), classification per B1, schedules contiguous and closing correctly.`);
} finally {
  client.release();
  await pool.end();
}
