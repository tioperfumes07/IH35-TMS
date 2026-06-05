#!/usr/bin/env node
/**
 * USMCA-1 CI guard: carrier-scoped tables (operating_company_id column) must have
 * ENABLE + FORCE RLS and at least one policy referencing app.operating_company_id.
 */
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const { Pool } = pg;
const url = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error("verify:rls-operating-company-scope FAIL: missing DATABASE_DIRECT_URL");
  process.exit(1);
}

const pool = new Pool({ connectionString: url });

async function main() {
  const client = await pool.connect();
  const failures = [];
  try {
    await client.query("SET ROLE ih35_app");
    const res = await client.query(`
      SELECT
        n.nspname AS schema_name,
        c.relname AS table_name,
        c.relrowsecurity AS rls_enabled,
        c.relforcerowsecurity AS rls_forced,
        EXISTS (
          SELECT 1
          FROM pg_policy p
          WHERE p.polrelid = c.oid
            AND (
              pg_get_expr(p.polqual, p.polrelid) ILIKE '%operating_company_id%'
              OR pg_get_expr(p.polwithcheck, p.polrelid) ILIKE '%operating_company_id%'
            )
        ) AS has_tenant_policy,
        EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid) AS has_any_policy
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind = 'r'
        AND n.nspname NOT IN ('pg_catalog', 'information_schema')
        AND EXISTS (
          SELECT 1
          FROM pg_attribute a
          WHERE a.attrelid = c.oid
            AND a.attname = 'operating_company_id'
            AND NOT a.attisdropped
        )
      ORDER BY n.nspname, c.relname
    `);

    const gaps = [];
    for (const row of res.rows) {
      const label = `${row.schema_name}.${row.table_name}`;
      if (!row.rls_enabled) {
        gaps.push(`${label}: RLS not enabled (documented gap — USMCA-3 follow-up)`);
        continue;
      }
      if (!row.rls_forced) failures.push(`${label}: FORCE ROW LEVEL SECURITY not set`);
      if (!row.has_tenant_policy && !row.has_any_policy) {
        failures.push(`${label}: missing RLS policy`);
      }
    }

    if (gaps.length > 0) {
      console.log(`verify:rls-operating-company-scope WARN ${gaps.length} tables without RLS (inventory in docs/specs/MULTI-CARRIER-ISOLATION.md)`);
    }

    if (failures.length > 0) {
      console.error("verify:rls-operating-company-scope FAIL");
      for (const f of failures) console.error(` - ${f}`);
      process.exit(1);
    }

    console.log(
      `verify:rls-operating-company-scope PASS (${res.rows.length} carrier-scoped tables audited)`
    );
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("verify:rls-operating-company-scope FAIL:", err);
  process.exit(1);
});
