#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const canonical = {
  client: read("apps/backend/src/integrations/samsara/samsara-client.ts"),
  collector: read("apps/backend/src/integrations/samsara/driver-mirror-collector.ts"),
  cron: read("apps/backend/src/cron/samsara-remote-count-collector.cron.ts"),
  routes: read("apps/backend/src/integrations/samsara/samsara-master-sync.routes.ts"),
  roster: read("apps/backend/src/integrations/samsara/samsara-config.routes.ts"),
  page: read("apps/frontend/src/pages/integrations/SamsaraIntegrationPage.tsx"),
  migration: read("db/migrations/202613772200_samsara_driver_activation_status.sql"),
  step: read("scripts/verify-steps/3334-verify-codex-vertical-nonmoney-zero-remainder.mjs"),
};

export function failures(files = canonical) {
  const out = [];
  if (!files.client.includes('["active", "deactivated"]') || !files.client.includes("driverActivationStatus: activationStatus") || !files.client.includes("after") || /listDriversAllActivationStatuses[\s\S]{0,1600}catch\s*\{/.test(files.client)) out.push("client must paginate active and deactivated status passes and fail closed on either pass");
  if (!files.collector.includes("listDriversAllActivationStatuses") || !files.collector.includes("driver_activation_status = EXCLUDED.driver_activation_status")) out.push("collector must upsert both-status mirror rows by canonical key");
  if (!files.collector.includes("cdl_number") || !files.collector.includes("mexican_license_number") || !files.collector.includes("candidates.length === 1")) out.push("collector must link by license then unambiguous exact name without creating driver masters");
  if (!files.cron.includes('"5 */12 * * *"') || !files.cron.includes("collectSamsaraDriverMirror")) out.push("existing twelve-hour collector schedule must run the mirror");
  if (!files.routes.includes('/api/v1/integrations/samsara/drivers/resync') || !files.routes.includes("adminRole") || !files.routes.includes("collectSamsaraDriverMirror")) out.push("admin resync endpoint must invoke the same collector");
  if (!files.roster.includes("sd.driver_activation_status") || !files.page.includes('"active", "deactivated", "all"')) out.push("roster must filter Active, Deactivated, and All from the canonical mirror column");
  if (!files.migration.includes("driver_activation_status SET NOT NULL") || !files.migration.includes("samsara_drivers_activation_status_check")) out.push("schema must hold a non-null constrained activation status");
  if (!files.step.includes("verify-samsara-driver-mirror-complete.mjs")) out.push("guard must be registered in CI verify-step 3334");
  return out;
}

async function live() {
  const pg = await import("pg");
  const pool = new pg.default.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    const result = await client.query(`WITH bypass AS (
      SELECT set_config('app.bypass_rls','lucia',false)
    )
      SELECT count(*)::int total,
      count(*) FILTER (WHERE driver_activation_status='active')::int active,
      count(*) FILTER (WHERE driver_activation_status='deactivated')::int deactivated,
      count(*) FILTER (WHERE driver_activation_status IS NULL)::int null_status,
      max(updated_at) freshest
      FROM bypass, integrations.samsara_drivers
      WHERE operating_company_id=$1::uuid`, ["5c854333-6ea5-4faa-af31-67cb272fef80"]);
    await client.query("ROLLBACK");
    const row = result.rows[0];
    const fresh = row.freshest && Date.now() - new Date(row.freshest).getTime() < 24 * 60 * 60 * 1000;
    if (row.total < 757 || row.null_status !== 0 || !fresh) throw new Error(`live incomplete ${JSON.stringify(row)}`);
    console.log(`PASS verify-samsara-driver-mirror-complete live total=${row.total} active=${row.active} deactivated=${row.deactivated} null=0 freshness<24h`);
  } finally { client.release(); await pool.end(); }
}

if (process.argv.includes("--selftest")) {
  const plants = [
    { ...canonical, client: canonical.client.replace('["active", "deactivated"]', '["active"]') },
    { ...canonical, collector: canonical.collector.replace("driver_activation_status = EXCLUDED.driver_activation_status", "raw_payload = EXCLUDED.raw_payload") },
    { ...canonical, cron: canonical.cron.replace('"5 */12 * * *"', '"5 * * * *"') },
    { ...canonical, routes: canonical.routes.replace('/api/v1/integrations/samsara/drivers/resync', '/missing') },
    { ...canonical, roster: canonical.roster.replace("sd.driver_activation_status", "'active'") },
  ];
  for (const plant of plants) if (failures(plant).length === 0) throw new Error("planted regression escaped");
  console.log(`PASS verify-samsara-driver-mirror-complete --selftest ${plants.length}/${plants.length}`);
}
const staticFailures = failures();
if (staticFailures.length) { staticFailures.forEach((x) => console.error(`FAIL ${x}`)); process.exit(1); }
console.log("PASS verify-samsara-driver-mirror-complete static 8/8");
if (process.argv.includes("--live")) await live();
