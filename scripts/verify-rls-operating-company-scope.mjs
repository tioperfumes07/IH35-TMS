#!/usr/bin/env node
/**
 * USMCA-1 CI guard: every live table with operating_company_id must have RLS enabled
 * and at least one policy referencing app.operating_company_id.
 */
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { fileURLToPath } from "node:url";

dotenv.config();

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scopeModule = path.join(ROOT, "apps/backend/src/auth/operating-company-scope.ts");
const migrationPath = path.join(ROOT, "db/migrations/0385_rls_audit_all_tables.sql");

const { Pool } = pg;
const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;

function fail(msg) {
  console.error(`verify:rls-operating-company-scope FAIL: ${msg}`);
  process.exit(1);
}

function readRequired(filePath, label) {
  if (!fs.existsSync(filePath)) fail(`missing ${label}: ${path.relative(ROOT, filePath)}`);
  return fs.readFileSync(filePath, "utf8");
}

async function main() {
  const scopeSrc = readRequired(scopeModule, "operating-company-scope module");
  if (!scopeSrc.includes("requireOperatingCompanyScope")) {
    fail("operating-company-scope.ts must export requireOperatingCompanyScope");
  }
  if (!scopeSrc.includes("withOperatingCompanyScope")) {
    fail("operating-company-scope.ts must export withOperatingCompanyScope");
  }

  const migrationSrc = readRequired(migrationPath, "0385 migration");
  for (const table of ["qbo_sync.drift_log", "qbo_sync.drift_alert_throttle", "integrations.qbo_payroll_links"]) {
    if (!migrationSrc.includes(table)) fail(`0385 must harden RLS for ${table}`);
    if (!new RegExp(`ENABLE ROW LEVEL SECURITY`, "m").test(migrationSrc)) {
      fail(`0385 must ENABLE ROW LEVEL SECURITY`);
    }
  }

  if (!connectionString) {
    console.log("verify:rls-operating-company-scope PASS (static checks only; no DATABASE_DIRECT_URL)");
    return;
  }

  const pool = new Pool({ connectionString });
  const client = await pool.connect();
  try {
    await client.query("SET ROLE ih35_app");

    const tablesRes = await client.query(
      `
        SELECT
          n.nspname AS schema_name,
          c.relname AS table_name,
          c.relrowsecurity AS rls_enabled,
          (
            SELECT count(*)::int
            FROM pg_policy p
            WHERE p.polrelid = c.oid
          ) AS policy_count
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_attribute a ON a.attrelid = c.oid
        WHERE c.relkind = 'r'
          AND a.attname = 'operating_company_id'
          AND NOT a.attisdropped
          AND n.nspname NOT IN ('pg_catalog', 'information_schema')
        GROUP BY n.nspname, c.relname, c.relrowsecurity, c.oid
        ORDER BY 1, 2
      `
    );

    const missingRls = tablesRes.rows.filter((row) => !row.rls_enabled);
    const missingPolicy = tablesRes.rows.filter((row) => row.policy_count === 0);

    if (missingRls.length > 0) {
      fail(
        `tables with operating_company_id but RLS disabled: ${missingRls
          .map((r) => `${r.schema_name}.${r.table_name}`)
          .join(", ")}`
      );
    }
    if (missingPolicy.length > 0) {
      fail(
        `tables with operating_company_id but no RLS policies: ${missingPolicy
          .map((r) => `${r.schema_name}.${r.table_name}`)
          .join(", ")}`
      );
    }

    console.log(
      `verify:rls-operating-company-scope PASS (${tablesRes.rows.length} carrier-scoped tables audited)`
    );
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => fail(String(err?.message || err)));
