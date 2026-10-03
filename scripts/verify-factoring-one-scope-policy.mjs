#!/usr/bin/env node
// ROUND 342 Phase 4 — one scope column, one RLS policy, on the three factoring tables that carried two.
// Permissive policies OR together (PostgreSQL CREATE POLICY), so a tenant_id policy beside the operating_company_id
// policy made a row visible if EITHER column matched. operating_company_id is canonical (owner ruling, ROUND 342).
// Static: every writer of these tables sets operating_company_id explicitly (the factor and letter-of-release INSERTs
// set tenant_id alone and leaned on the duplicate policy's WITH CHECK), and migration 202615310600 drops the three
// tenant policies. Live (DATABASE_URL): each table has exactly one policy and it keys on operating_company_id. A live
// check that cannot run FAILS. --selftest plants each regression.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-factoring-one-scope-policy";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SERVICE = "apps/backend/src/factoring/factor.service.ts";
const MIG = "db/migrations/202615310600_factoring_drop_duplicate_tenant_policies.sql";
const TABLES = ["customer_factor_assignment", "factor", "letter_of_release"];
const DROPPED = [
  ["factoring_customer_factor_assignment_tenant_scope_v2", "customer_factor_assignment"],
  ["factoring_factor_tenant_scope_v2", "factor"],
  ["factoring_lor_tenant_scope", "letter_of_release"],
];

export function check(service, mig) {
  const fails = [];
  for (const t of TABLES) {
    const inserts = [...service.matchAll(new RegExp(`INSERT INTO factoring\\.${t} \\(([\\s\\S]*?)\\)\\s*VALUES`, "g"))];
    if (inserts.length === 0) fails.push(`${SERVICE}: no INSERT INTO factoring.${t} found (writer moved? update this guard)`);
    for (const m of inserts) {
      const cols = m[1].replace(/--[^\n]*/g, "");
      if (!/\boperating_company_id\b/.test(cols)) fails.push(`${SERVICE}: INSERT INTO factoring.${t} does not set operating_company_id`);
    }
  }
  for (const [pol, t] of DROPPED) {
    if (!mig.includes(`DROP POLICY IF EXISTS ${pol} ON factoring.${t};`)) fails.push(`${MIG}: does not drop ${pol}`);
  }
  if (!/RAISE EXCEPTION 'ROUND 342 Phase 4 refused/.test(mig)) fails.push(`${MIG}: pre-arm refusal (NULL / disagreeing scope rows) missing`);
  return fails;
}

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

if (process.argv.includes("--selftest")) {
  const s = read(SERVICE);
  const g = read(MIG);
  if (check(s, g).length) { console.error(`${LABEL} --selftest FAIL: tree not clean: ${check(s, g).join("; ")}`); process.exit(1); }
  const dropOpco = (src, table) => {
    const at = src.indexOf(`INSERT INTO factoring.${table} (`);
    const end = src.indexOf("VALUES", at);
    return src.slice(0, at) + src.slice(at, end).replace(/\n\s*operating_company_id\n/, "\n") + src.slice(end);
  };
  const plants = [
    ["factor INSERT without operating_company_id", dropOpco(s, "factor"), g],
    ["letter_of_release INSERT without operating_company_id", dropOpco(s, "letter_of_release"), g],
    ["customer_factor_assignment INSERT without operating_company_id", dropOpco(s, "customer_factor_assignment"), g],
    ["tenant policy kept", s, g.replace("DROP POLICY IF EXISTS factoring_factor_tenant_scope_v2 ON factoring.factor;", "")],
    ["pre-arm refusal removed", s, g.replace("RAISE EXCEPTION 'ROUND 342 Phase 4 refused", "RAISE NOTICE 'ROUND 342 Phase 4 refused")],
  ];
  const unchanged = plants.filter(([, ps, pg]) => ps === s && pg === g).map(([n]) => n);
  if (unchanged.length) { console.error(`${LABEL} --selftest FAIL: plant did not change the source: ${unchanged.join("; ")}`); process.exit(1); }
  const missed = plants.filter(([, ps, pg]) => check(ps, pg).length === 0).map(([n]) => n);
  if (missed.length) { console.error(`${LABEL} --selftest FAIL: not caught: ${missed.join("; ")}`); process.exit(1); }
  console.log(`${LABEL} --selftest PASS ${plants.length}/${plants.length}`);
  process.exit(0);
}

const fails = check(read(SERVICE), read(MIG));
if (fails.length) { console.error(`${LABEL}: FAIL\n  ${fails.join("\n  ")}`); process.exit(1); }
if (!process.env.DATABASE_URL) { console.error(`${LABEL}: FAIL — static passed; the live check needs DATABASE_URL`); process.exit(1); }
const { default: pg } = await import("pg");
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 15000, statement_timeout: 30000 });
try {
  await c.connect();
  const rows = (await c.query(`
    SELECT c.relname,
           count(*)::int AS policies,
           count(*) FILTER (WHERE pg_get_expr(p.polqual, p.polrelid) LIKE '%tenant_id%'
                             OR pg_get_expr(p.polwithcheck, p.polrelid) LIKE '%tenant_id%')::int AS on_tenant,
           count(*) FILTER (WHERE pg_get_expr(p.polqual, p.polrelid) LIKE '%operating_company_id%')::int AS on_opco
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'factoring'
      LEFT JOIN pg_policy p ON p.polrelid = c.oid
     WHERE c.relname = ANY($1::text[])
     GROUP BY c.relname ORDER BY c.relname`, [TABLES])).rows;
  const bad = rows.filter((r) => r.policies !== 1 || r.on_tenant !== 0 || r.on_opco !== 1);
  if (rows.length !== TABLES.length || bad.length) {
    console.error(`${LABEL}: LIVE FAIL — ${bad.map((r) => `factoring.${r.relname}: ${r.policies} policies, ${r.on_tenant} on tenant_id`).join("; ") || `${rows.length}/3 tables found`} (migration 202615310600 applied?)`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS — static: 3 writers set operating_company_id, 3 tenant policies dropped; live: 3/3 tables have one policy, on operating_company_id`);
} catch (err) {
  console.error(`${LABEL}: FAIL — live check could not run: ${err.message}`);
  process.exit(1);
} finally {
  await c.end().catch(() => {});
}
