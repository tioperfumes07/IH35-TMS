#!/usr/bin/env node
// ROUND 342 Phase 2 step 2a — on the 17 tables that carry both tenant_id and operating_company_id, operating_company_id
// is complete and authoritative before tenant_id is retired (owner ruling: one scope column).
// Static: migration 202615310700 asserts 0 disagreements and RAISEs otherwise, backfills, sets NOT NULL, twins every
// tenant_id index (uq_factoring_factor_opco_id included — the target of CC-1's same-entity FK on
// factoring.canonical_factor_agreements), replaces the four tenant-keyed policies, and checks its own post-conditions.
// Live (DATABASE_URL): operating_company_id NOT NULL on all 17; no policy on them reads tenant_id; every tenant_id index
// has an operating_company_id twin; uq_factoring_factor_opco_id is UNIQUE (operating_company_id, id). A live check that
// cannot run FAILS. --selftest plants each regression.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";


export const REQUIRES_LIVE_DB = "Neon live verification required";
const LABEL = "verify-r342-opco-canonical-on-double-scoped";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIG = "db/migrations/202615310700_r342_phase2a_expand_operating_company_id.sql";
export const TABLES = [
  "factoring.bank_match_suggestion", "factoring.batch", "factoring.customer_factor_assignment", "factoring.factor",
  "factoring.letter_of_release", "factoring.reserve_movement",
  "insurance.claim", "insurance.coi_request", "insurance.lawsuit", "insurance.payment_schedule", "insurance.policy",
  "insurance.policy_unit", "insurance.refund_obligation",
  "maintenance.internal_labor_log", "master_data.customer_terms_history", "mdata.mx_permits", "mdata.mx_tolls_ledger",
];

export function check(sql) {
  const fails = [];
  for (const t of TABLES) if (!sql.includes(`'${t}'`)) fails.push(`${t} not covered`);
  if (!/RAISE EXCEPTION 'ROUND 342 Phase 2a refused: % has % row\(s\) where tenant_id and operating_company_id disagree/.test(sql)) fails.push("disagreement assertion missing");
  if (!/SET operating_company_id = tenant_id WHERE operating_company_id IS NULL/.test(sql)) fails.push("backfill missing");
  if (!/ALTER COLUMN operating_company_id SET NOT NULL/.test(sql)) fails.push("operating_company_id SET NOT NULL missing");
  if (!/WHEN r\.idx = 'uq_factoring_factor_tenant_id' THEN 'uq_factoring_factor_opco_id'/.test(sql)) fails.push("CC-1 FK target uq_factoring_factor_opco_id not built");
  for (const p of ["mx_permits_tenant_isolation", "mx_tolls_tenant_isolation", "internal_labor_log_tenant_isolation", "customer_terms_history_tenant_scope"]) {
    if (!sql.includes(`DROP POLICY IF EXISTS ${p} ON`)) fails.push(`tenant-keyed policy ${p} not replaced`);
  }
  if (/DROP COLUMN\s+(IF EXISTS\s+)?tenant_id/i.test(sql)) fails.push("step 2a must not drop tenant_id (that is 2c, after CC-1 confirms)");
  if (!/still read tenant_id/.test(sql) || !/still allow a NULL operating_company_id/.test(sql)) fails.push("post-conditions missing");
  return fails.map((f) => `${MIG}: ${f}`);
}

if (process.argv.includes("--selftest")) {
  const g = fs.readFileSync(path.join(ROOT, MIG), "utf8");
  if (check(g).length) { console.error(`${LABEL} --selftest FAIL: tree not clean: ${check(g).join("; ")}`); process.exit(1); }
  const plants = [
    ["assertion softened", g.replace("RAISE EXCEPTION 'ROUND 342 Phase 2a refused", "RAISE NOTICE 'ROUND 342 Phase 2a refused")],
    ["CC-1 FK target not rebuilt", g.replace("THEN 'uq_factoring_factor_opco_id'", "THEN 'uq_factoring_factor_other'")],
    ["a table dropped from the list", g.replaceAll("'insurance.payment_schedule'", "'insurance.payment_schedule_x'")],
    ["a tenant policy left in place", g.replace("DROP POLICY IF EXISTS mx_permits_tenant_isolation ON mdata.mx_permits;", "")],
    ["tenant_id dropped early", g.replace("ALTER COLUMN tenant_id DROP NOT NULL", "DROP COLUMN tenant_id")],
  ];
  const unchanged = plants.filter(([, s]) => s === g).map(([n]) => n);
  if (unchanged.length) { console.error(`${LABEL} --selftest FAIL: plant did not change the source: ${unchanged.join("; ")}`); process.exit(1); }
  const missed = plants.filter(([, s]) => check(s).length === 0).map(([n]) => n);
  if (missed.length) { console.error(`${LABEL} --selftest FAIL: not caught: ${missed.join("; ")}`); process.exit(1); }
  console.log(`${LABEL} --selftest PASS ${plants.length}/${plants.length}`);
  process.exit(0);
}

const fails = check(fs.readFileSync(path.join(ROOT, MIG), "utf8"));
if (fails.length) { console.error(`${LABEL}: FAIL\n  ${fails.join("\n  ")}`); process.exit(1); }
if (!process.env.DATABASE_URL) { console.error(`${LABEL}: FAIL — static passed; the live check needs DATABASE_URL`); process.exit(1); }
const { default: pg } = await import("pg");
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 15000, statement_timeout: 30000 });
try {
  await c.connect();
  const r = (await c.query(`
    WITH t AS (SELECT unnest($1::text[]) AS q)
    SELECT
      (SELECT count(*) FROM information_schema.columns ic JOIN t ON t.q = ic.table_schema || '.' || ic.table_name
        WHERE ic.column_name = 'operating_company_id' AND ic.is_nullable = 'YES')::int AS opco_nullable,
      (SELECT count(*) FROM pg_policy p JOIN t ON t.q = p.polrelid::regclass::text
        WHERE pg_get_expr(p.polqual, p.polrelid) ~ '\\mtenant_id\\M'
           OR coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') ~ '\\mtenant_id\\M')::int AS tenant_policies,
      (SELECT count(*) FROM pg_index i JOIN t ON t.q = i.indrelid::regclass::text
        WHERE pg_get_indexdef(i.indexrelid) ~ '\\mtenant_id\\M'
          AND NOT EXISTS (SELECT 1 FROM pg_index j WHERE j.indrelid = i.indrelid AND j.indisunique = i.indisunique
                           AND pg_get_indexdef(j.indexrelid) ~ '\\moperating_company_id\\M'
                           AND regexp_replace(pg_get_indexdef(j.indexrelid), '^.* USING ', '')
                             = regexp_replace(regexp_replace(pg_get_indexdef(i.indexrelid), '\\mtenant_id\\M', 'operating_company_id', 'g'), '^.* USING ', '')))::int AS untwinned,
      (SELECT count(*) FROM pg_index i JOIN pg_class ic ON ic.oid = i.indexrelid
        WHERE ic.relname = 'uq_factoring_factor_opco_id' AND i.indisunique
          AND pg_get_indexdef(i.indexrelid) LIKE '%(operating_company_id, id)%')::int AS cc1_target`, [TABLES])).rows[0];
  const bad = [];
  if (r.opco_nullable) bad.push(`${r.opco_nullable} table(s) allow NULL operating_company_id`);
  if (r.tenant_policies) bad.push(`${r.tenant_policies} policy(ies) still read tenant_id`);
  if (r.untwinned) bad.push(`${r.untwinned} tenant_id index(es) without an operating_company_id twin`);
  if (r.cc1_target !== 1) bad.push("uq_factoring_factor_opco_id (operating_company_id, id) missing — CC-1's same-entity FK has no target");
  if (bad.length) { console.error(`${LABEL}: LIVE FAIL — ${bad.join("; ")} (migration 202615310700 applied?)`); process.exit(1); }
  console.log(`${LABEL}: PASS — static ${TABLES.length} tables; live: opco NOT NULL 17/17, 0 tenant policies, 0 untwinned tenant indexes, CC-1 FK target present`);
} catch (err) {
  console.error(`${LABEL}: FAIL — live check could not run: ${err.message}`);
  process.exit(1);
} finally {
  await c.end().catch(() => {});
}
