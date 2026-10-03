#!/usr/bin/env node
// ROUND 342 hotfix — a WHERE on operating_company_id against a table that has NO such column is a runtime SQL error
// ("column operating_company_id does not exist"), not a scope. #24298 (insurance read sweep) put
// COALESCE(operating_company_id, tenant_id) on insurance.type_catalog (policy create + update coverage-type lookup) and
// mdata.assets (coverage-gap report); both tables carry tenant_id only until CC-1's rename (ROUND 342 Phase 1).
// The rule: for every table that lacks operating_company_id, no query `FROM <table> [alias] WHERE …` may name it.
// Table list: live from information_schema when DATABASE_URL is set (so the guard follows CC-1's rename by itself);
// otherwise the static ROUND 342 rename-only list. --selftest plants the exact #24298 shapes.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-no-opco-filter-on-tables-without-it";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "apps/backend/src");
// Rename-only tables per the ROUND 342 inventory (tenant_id, no operating_company_id) — used when offline.
const STATIC_TABLES = [
  "insurance.type_catalog", "mdata.assets", "mdata.asset_status_history", "factoring.canonical_factor_agreements",
  "accounting.bill_unit_allocation", "accounting.coa_account", "accounting.ps_category", "accounting.ps_item",
  "accounting.pse_posting_policy", "accounting.vendor_subtype_pse_map", "maint.part", "maint.pm_schedule",
];

export function offenders(src, tables) {
  const out = [];
  for (const t of tables) {
    const re = new RegExp(`FROM\\s+${t.replace(".", "\\.")}(?:\\s+(?:AS\\s+)?(\\w+))?\\s+WHERE\\b([\\s\\S]{0,300}?)(?:\`|;|\\bGROUP\\b|\\bORDER\\b|\\bLIMIT\\b|\\bRETURNING\\b|$)`, "gi");
    let m;
    while ((m = re.exec(src)) !== null) {
      const alias = m[1] && !/^(WHERE|JOIN|LEFT|INNER)$/i.test(m[1]) ? m[1] : null;
      const where = m[2];
      const bare = /(^|[^\w.])operating_company_id\b/.test(where);
      const aliased = alias ? new RegExp(`\\b${alias}\\.operating_company_id\\b`).test(where) : false;
      if (bare || aliased) out.push(t);
    }
  }
  return out;
}

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!["node_modules", "__tests__"].includes(e.name)) walk(p, acc); }
    else if (e.name.endsWith(".ts") && !e.name.includes(".test.")) acc.push(p);
  }
  return acc;
}

if (process.argv.includes("--selftest")) {
  const T = ["insurance.type_catalog", "mdata.assets"];
  const bad1 = "SELECT id::text\n          FROM insurance.type_catalog\n          WHERE COALESCE(operating_company_id, tenant_id) = $1::uuid\n            AND id = $2::uuid`";
  const bad2 = "SELECT id::text, asset_type::text\n      FROM mdata.assets\n      WHERE COALESCE(operating_company_id, tenant_id) = $1::uuid`";
  const good1 = "SELECT id::text\n          FROM insurance.type_catalog\n          WHERE tenant_id = $1::uuid\n            AND id = $2::uuid`";
  const good2 = "FROM mdata.assets a WHERE a.tenant_id = $1::uuid AND a.id = $2`";
  const fails = [];
  if (offenders(bad1, T).length !== 1) fails.push("#24298 type_catalog shape not caught");
  if (offenders(bad2, T).length !== 1) fails.push("#24298 mdata.assets shape not caught");
  if (offenders(good1, T).length || offenders(good2, T).length) fails.push("a tenant_id-scoped read was flagged");
  if (fails.length) { console.error(`${LABEL} --selftest FAIL: ${fails.join("; ")}`); process.exit(1); }
  console.log(`${LABEL} --selftest PASS 3/3`);
  process.exit(0);
}

let tables = STATIC_TABLES;
let source = "static ROUND 342 rename-only list";
if (process.env.DATABASE_URL) {
  const { default: pg } = await import("pg");
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 15000, statement_timeout: 30000 });
  try {
    await c.connect();
    const r = await c.query(`
      SELECT t.table_schema || '.' || t.table_name AS q
        FROM information_schema.columns t
       WHERE t.column_name = 'tenant_id' AND t.table_schema NOT IN ('pg_catalog', 'information_schema')
         AND NOT EXISTS (SELECT 1 FROM information_schema.columns o
                          WHERE o.table_schema = t.table_schema AND o.table_name = t.table_name
                            AND o.column_name = 'operating_company_id')`);
    tables = r.rows.map((x) => x.q);
    source = `live information_schema (${tables.length} tables with tenant_id and no operating_company_id)`;
  } catch (err) {
    console.error(`${LABEL}: FAIL — live check could not run: ${err.message}`);
    process.exit(1);
  } finally {
    await c.end().catch(() => {});
  }
}
const problems = [];
for (const f of walk(SRC)) {
  for (const t of offenders(fs.readFileSync(f, "utf8"), tables)) problems.push(`${path.relative(ROOT, f)}: filters ${t} on operating_company_id, which that table does not have`);
}
if (problems.length) { console.error(`${LABEL}: FAIL (${source})\n  ${problems.join("\n  ")}`); process.exit(1); }
console.log(`${LABEL}: PASS — no read filters a table on a column it lacks (${source})`);
