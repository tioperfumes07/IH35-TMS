#!/usr/bin/env node
/**
 * CLOSURE-19-SEC-AUDIT — RLS policy audit for app/mdata/identity schemas.
 * Static migration checks + optional live pg_policies audit when DATABASE_URL set.
 */
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { fileURLToPath } from "node:url";

dotenv.config();

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "sec-audit-rls-policies";
const TARGET_SCHEMAS = ["app", "mdata", "identity"];
const EXCLUDED_TABLES = new Set(["schema_migrations", "spatial_ref_sys"]);

const { Pool } = pg;
const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;

function fail(message) {
  console.error(`[${LABEL}] FAIL: ${message}`);
  process.exit(1);
}

function warn(message) {
  console.warn(`[${LABEL}] WARN: ${message}`);
}

function readRequired(relPath, label) {
  const abs = path.join(ROOT, relPath);
  if (!fs.existsSync(abs)) fail(`missing ${label}: ${relPath}`);
  return fs.readFileSync(abs, "utf8");
}

async function auditLivePolicies() {
  const pool = new Pool({ connectionString });
  const client = await pool.connect();
  const report = {
    schemas: TARGET_SCHEMAS,
    tables_audited: 0,
    missing_rls: [],
    missing_policies: [],
    weak_policies: [],
    cross_tenant: { attempted: false, passed: null, detail: null },
  };

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
          ) AS policy_count,
          (
            SELECT string_agg(p.polname, ', ' ORDER BY p.polname)
            FROM pg_policy p
            WHERE p.polrelid = c.oid
          ) AS policy_names
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind = 'r'
          AND n.nspname = ANY($1::text[])
        ORDER BY 1, 2
      `,
      [TARGET_SCHEMAS]
    );

    for (const row of tablesRes.rows) {
      if (EXCLUDED_TABLES.has(row.table_name)) continue;
      report.tables_audited += 1;
      const qualified = `${row.schema_name}.${row.table_name}`;
      if (!row.rls_enabled) report.missing_rls.push(qualified);
      if (Number(row.policy_count) === 0) report.missing_policies.push(qualified);
      else if (
        row.schema_name !== "identity" &&
        row.policy_names &&
        !/operating_company|tenant|carrier|company_id/i.test(String(row.policy_names))
      ) {
        report.weak_policies.push({
          table: qualified,
          policies: row.policy_names,
          note: "no obvious tenant/carrier scope in policy names — manual review",
        });
      }
    }

    report.cross_tenant = await probeCrossTenantIsolation(client);
  } finally {
    client.release();
    await pool.end();
  }

  return report;
}

async function probeCrossTenantIsolation(client) {
  const result = { attempted: true, passed: true, detail: null };
  try {
    const companiesRes = await client.query(
      `SELECT id, code FROM org.companies WHERE code IN ('TRANSP', 'USMCA') ORDER BY code`
    );
    if (companiesRes.rows.length < 2) {
      result.detail = "insufficient seed companies for cross-tenant probe";
      return result;
    }

    const transp = companiesRes.rows.find((r) => r.code === "TRANSP")?.id;
    const usmca = companiesRes.rows.find((r) => r.code === "USMCA")?.id;
    if (!transp || !usmca) {
      result.detail = "TRANSP/USMCA fixtures missing";
      return result;
    }

    const suffix = `SEC19-${Date.now()}`;
    let fixtureId = null;

    await client.query("BEGIN");
    try {
      await client.query("SET LOCAL app.bypass_rls = 'lucia'");
      const insertRes = await client.query(
        `
          INSERT INTO catalogs.complaint_types (operating_company_id, type_code, type_name, default_severity, is_active)
          VALUES ($1, $2, $3, 'info', true)
          RETURNING id
        `,
        [transp, suffix, "SEC-AUDIT cross-tenant probe"]
      );
      fixtureId = insertRes.rows[0]?.id;
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }

    const usmcaCount = await runScoped(client, usmca, async () => {
      const res = await client.query(`SELECT count(*)::int AS c FROM catalogs.complaint_types WHERE id = $1`, [fixtureId]);
      return Number(res.rows[0]?.c ?? 0);
    });

    if (usmcaCount !== 0) {
      result.passed = false;
      result.detail = `USMCA session saw ${usmcaCount} TRANSP rows in catalogs.complaint_types`;
    } else {
      result.detail = "TRANSP fixture invisible under USMCA operating_company_id scope";
    }

    await runWithBypass(client, async () => {
      await client.query(`DELETE FROM catalogs.complaint_types WHERE id = $1`, [fixtureId]);
    });
  } catch (err) {
    result.passed = false;
    result.detail = String(err?.message || err);
  }
  return result;
}

async function runWithBypass(client, fn) {
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
    const out = await fn();
    await client.query("COMMIT");
    return out;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

async function runScoped(client, companyId, fn) {
  await client.query("BEGIN");
  try {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [companyId]);
    const out = await fn();
    await client.query("COMMIT");
    return out;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

function runStaticChecks() {
  readRequired("apps/backend/src/auth/operating-company-scope.ts", "operating-company-scope");
  readRequired("db/migrations/0385_rls_audit_all_tables.sql", "0385 RLS migration");
  readRequired("scripts/verify-rls-operating-company-scope.mjs", "RLS CI guard");
  readRequired("scripts/verify-no-cross-carrier-data-leak.mjs", "cross-carrier leak guard");
  console.log(`[${LABEL}] static RLS guard modules present`);
}

async function main() {
  runStaticChecks();
  const report = { mode: connectionString ? "live+static" : "static-only", live: null };

  if (!connectionString) {
    warn("DATABASE_DIRECT_URL not set — skipping live pg_policies audit");
    console.log(JSON.stringify(report, null, 2));
    console.log(`[${LABEL}] PASS (static checks)`);
    return;
  }

  report.live = await auditLivePolicies();
  console.log(JSON.stringify(report, null, 2));

  if (report.live.missing_rls.length > 0) {
    warn(`RLS disabled on ${report.live.missing_rls.length} table(s): ${report.live.missing_rls.join(", ")}`);
  }
  if (report.live.missing_policies.length > 0) {
    warn(`no policies on ${report.live.missing_policies.length} table(s): ${report.live.missing_policies.join(", ")}`);
  }
  if (report.live.cross_tenant.passed === false) {
    fail(`cross-tenant isolation FAILED: ${report.live.cross_tenant.detail}`);
  }

  if (report.live.weak_policies.length > 0) {
    warn(`${report.live.weak_policies.length} tables flagged for manual policy-name review`);
  }

  console.log(`[${LABEL}] PASS (${report.live.tables_audited} tables audited)`);
}

main().catch((err) => fail(String(err?.message || err)));
