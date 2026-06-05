#!/usr/bin/env node
/**
 * USMCA-3 CI guard: every launch toggle action records launched_by_user_id + launched_at
 * and a matching audit.events row (admin.carrier.launched / admin.carrier.rollback).
 */
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { fileURLToPath } from "node:url";

dotenv.config();

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function fail(msg) {
  console.error(`verify:launch-toggle-audit-trail FAIL: ${msg}`);
  process.exit(1);
}

function readRequired(relPath) {
  const abs = path.join(ROOT, relPath);
  if (!fs.existsSync(abs)) fail(`missing file: ${relPath}`);
  return fs.readFileSync(abs, "utf8");
}

async function main() {
  const togglesTs = readRequired("apps/backend/src/admin/launch-toggles.ts");
  const routesTs = readRequired("apps/backend/src/admin/launch-toggles.routes.ts");
  const migration = readRequired("db/migrations/0388_admin_launch_toggles.sql");
  const frontend = readRequired("apps/frontend/src/pages/admin/LaunchToggles.tsx");
  const switcher = readRequired("apps/frontend/src/components/layout/CarrierSwitcher.tsx");
  const manifest = readRequired("apps/frontend/src/routes/manifest.tsx");

  if (!togglesTs.includes("toggleCarrierLaunch")) fail("toggleCarrierLaunch export required");
  if (!togglesTs.includes("admin.carrier.launched")) fail("launch audit event class required");
  if (!togglesTs.includes("admin.carrier.rollback")) fail("rollback audit event class required");
  if (!togglesTs.includes("launched_by_user_id")) fail("launched_by_user_id must be persisted");
  if (!routesTs.includes("/api/v1/admin/launch-toggles")) fail("launch-toggles routes required");
  if (!routesTs.includes("owner_only")) fail("launch-toggles routes must enforce owner_only");
  if (!migration.includes("admin.launch_toggles")) fail("0388 must create admin.launch_toggles");
  if (!frontend.includes("Launch toggles")) fail("LaunchToggles admin UI required");
  if (!switcher.includes("is_active")) fail("CarrierSwitcher must filter inactive carriers");
  if (!manifest.includes("/admin/launch-toggles")) fail("frontend route /admin/launch-toggles required");

  const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    console.log("verify:launch-toggle-audit-trail PASS (static checks only; no DATABASE_DIRECT_URL)");
    return;
  }

  const pool = new pg.Pool({ connectionString });
  const client = await pool.connect();
  try {
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");

    const tableRes = await client.query(`
      SELECT to_regclass('admin.launch_toggles') AS tbl
    `);
    if (!tableRes.rows[0]?.tbl) fail("admin.launch_toggles table missing after migration");

    const launchedRes = await client.query(`
      SELECT lt.operating_company_id, lt.launched_by_user_id, lt.launched_at
      FROM admin.launch_toggles lt
      WHERE lt.launched_at IS NOT NULL
    `);

    for (const row of launchedRes.rows) {
      if (!row.launched_by_user_id) {
        fail(`toggle ${row.operating_company_id} has launched_at but missing launched_by_user_id`);
      }
      const auditRes = await client.query(
        `
          SELECT 1
          FROM audit.audit_events ae
          WHERE ae.event_class = 'admin.carrier.launched'
            AND ae.payload->>'resource_id' = $1::text
          LIMIT 1
        `,
        [row.operating_company_id]
      );
      if (auditRes.rows.length === 0) {
        fail(`no admin.carrier.launched audit event for company ${row.operating_company_id}`);
      }
    }

    console.log("verify:launch-toggle-audit-trail PASS");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  fail(String(err?.message ?? err));
});
