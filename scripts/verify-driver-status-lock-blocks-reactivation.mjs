#!/usr/bin/env node
/**
 * DRV-STATUS-LOCK-PREVENTS-AUTO-REACTIVATION (owner urgent report 2026-09-07): "DRIVERS IS STILL
 * SHOWING ALL THOSE DRIVERS AS ACTIVE... I DEACTIVATED MANY DRIVERS IN SAMSARA... WE SHOULD ONLY
 * HAVE AROUND 30." Live-confirmed on prod (audit.row_changes, mdata.drivers, USMCA): the daily
 * mdata.driver_active_30d cron (driver-active-30d.service.ts) flips 70-91 drivers Active<->Inactive
 * on many single nights (91 reactivated 2026-09-01 alone) because its REACTIVATE branch could not
 * tell "auto-deactivated for inactivity" from "the owner deliberately deactivated this driver" — any
 * later touch to a stale load's updated_at was enough to silently undo the owner's action.
 *
 * mdata.drivers.status_locked_at (migration 202613980000) is the fix: non-NULL means an owner-sourced
 * deactivation (manual TMS /deactivate action, or the Samsara driver-mirror collector observing
 * driverActivationStatus=deactivated) is in effect, and the 30d cron's reactivate branch must never
 * touch that row. Set by /deactivate + the collector; cleared by /reactivate + the collector
 * observing the driver active again in Samsara (only when it holds that same collector's own lock).
 *
 * INVARIANT (static — no database):
 *   - driver-active-30d.service.ts's REACTIVATE query must gate on status_locked_at IS NULL
 *   - drivers.routes.ts's /deactivate route must SET status_locked_at = now() / status_locked_reason
 *     = 'manual_deactivate'
 *   - drivers.routes.ts's /reactivate route must clear both back to NULL
 *   - driver-mirror-collector.ts must lock on Samsara deactivated, and only clear its OWN
 *     'samsara_deactivated' lock (never a manual one) when Samsara reports active again
 *
 * Optional live behavioral proof (DATABASE_URL + ENABLE_LIVE_DB_UNIT_TEST_GUARD=true, same
 * honest-skip pattern as every other live-DB guard in this repo): plants a real scratch driver row,
 * locks it, proves applyDriverActive30dRule's reactivate branch skips it even though it matches the
 * activity predicate, then clears the lock and proves the SAME row reactivates. Rolled back, nothing
 * persisted.
 *
 * Run:
 *   node scripts/verify-driver-status-lock-blocks-reactivation.mjs --selftest   (no DB)
 *   node scripts/verify-driver-status-lock-blocks-reactivation.mjs              (static + optional live)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-driver-status-lock-blocks-reactivation";

const RULE_FILE = "apps/backend/src/mdata/driver-active-30d.service.ts";
const ROUTES_FILE = "apps/backend/src/mdata/drivers.routes.ts";
const COLLECTOR_FILE = "apps/backend/src/integrations/samsara/driver-mirror-collector.ts";
const MIGRATION_GLOB_PREFIX = "202613980000_drivers_status_lock_prevents_auto_reactivation";

export function checkSources({ rule, routes, collector, migrations }) {
  const problems = [];

  if (!/UPDATE mdata\.drivers d[\s\S]{0,400}status = 'Active'::mdata\.driver_status[\s\S]{0,300}AND d\.status_locked_at IS NULL[\s\S]{0,300}\$\{ACTIVITY_PREDICATE\}/.test(rule)) {
    problems.push(`${RULE_FILE}: the REACTIVATE query no longer gates on status_locked_at IS NULL — an owner-deactivated driver could be auto-reactivated again`);
  }

  const deactivateBlock = routes.match(/app\.post\("\/api\/v1\/mdata\/drivers\/:id\/deactivate"[\s\S]*?\n {2}\}\);/)?.[0] ?? "";
  if (!/SET deactivated_at = now\(\),[\s\S]{0,280}status_locked_at = now\(\),[\s\S]{0,160}status_locked_reason = (?:'manual_deactivate'|CASE WHEN \$4::boolean THEN 'test_fixture_quarantine' ELSE 'manual_deactivate' END)/.test(deactivateBlock)) {
    problems.push(`${ROUTES_FILE}: /deactivate no longer sets status_locked_at/status_locked_reason='manual_deactivate' — a manual deactivation would no longer be protected from the 30d cron`);
  }

  const reactivateBlock = routes.match(/app\.post\("\/api\/v1\/mdata\/drivers\/:id\/reactivate"[\s\S]*?\n {2}\}\);/)?.[0] ?? "";
  if (!/SET deactivated_at = NULL,[\s\S]{0,120}status = 'Active'::mdata\.driver_status,[\s\S]{0,80}status_locked_at = NULL,[\s\S]{0,80}status_locked_reason = NULL/.test(reactivateBlock)) {
    problems.push(`${ROUTES_FILE}: /reactivate no longer clears status_locked_at/status_locked_reason — a manually reactivated driver would stay permanently un-reactivatable by the 30d cron`);
  }

  if (!/status_locked_at = now\(\),[\s\S]{0,80}status_locked_reason = 'samsara_deactivated'/.test(collector)) {
    problems.push(`${COLLECTOR_FILE}: no longer locks mdata.drivers when Samsara reports driverActivationStatus=deactivated`);
  }
  if (!/status_locked_at = NULL,[\s\S]{0,80}status_locked_reason = NULL,[\s\S]{0,300}AND status_locked_reason = 'samsara_deactivated'/.test(collector)) {
    problems.push(`${COLLECTOR_FILE}: the active-again clear no longer scopes to WHERE status_locked_reason = 'samsara_deactivated' — could clear a human's manual_deactivate lock`);
  }

  const hasMigration = migrations.some((f) => f.startsWith(MIGRATION_GLOB_PREFIX));
  if (!hasMigration) {
    problems.push(`no migration found named ${MIGRATION_GLOB_PREFIX}*.sql adding status_locked_at/status_locked_reason`);
  } else {
    const migrationSrc = fs.readFileSync(path.join(ROOT, "db/migrations", migrations.find((f) => f.startsWith(MIGRATION_GLOB_PREFIX))), "utf8");
    if (!/ADD COLUMN IF NOT EXISTS status_locked_at timestamptz/.test(migrationSrc)) {
      problems.push(`${MIGRATION_GLOB_PREFIX}*.sql: does not idempotently add status_locked_at timestamptz`);
    }
    if (!/ADD COLUMN IF NOT EXISTS status_locked_reason text/.test(migrationSrc)) {
      problems.push(`${MIGRATION_GLOB_PREFIX}*.sql: does not idempotently add status_locked_reason text`);
    }
  }

  return problems;
}

function selftest() {
  const goodRule = `
    const reactivate = await client.query(
      \`
        UPDATE mdata.drivers d
           SET status = 'Active'::mdata.driver_status,
               deactivated_at = NULL,
               updated_at = now()
         WHERE d.archived_at IS NULL
           AND d.status = 'Inactive'::mdata.driver_status
           AND d.deactivated_at IS NOT NULL
           AND d.status_locked_at IS NULL
           AND ($2::uuid IS NULL OR d.operating_company_id = $2::uuid)
           AND \${ACTIVITY_PREDICATE}
        RETURNING d.id
      \`,
      [String(days), operatingCompanyId]
    );
  `;
  const goodRoutes = `
  app.post("/api/v1/mdata/drivers/:id/deactivate", { config: {} }, async (req, reply) => {
    const res = await client.query(
      \`
        UPDATE mdata.drivers
        SET deactivated_at = now(),
            status = CASE WHEN status = 'Terminated' THEN status ELSE 'Inactive'::mdata.driver_status END,
            status_locked_at = now(),
            status_locked_reason = 'manual_deactivate',
            updated_by_user_id = $2
        WHERE id = $1
      \`,
      []
    );
  });

  app.post("/api/v1/mdata/drivers/:id/reactivate", { config: {} }, async (req, reply) => {
    const res = await client.query(
      \`UPDATE mdata.drivers
          SET deactivated_at = NULL,
              status = 'Active'::mdata.driver_status,
              status_locked_at = NULL,
              status_locked_reason = NULL,
              updated_by_user_id = $2
        WHERE id = $1\`,
      []
    );
  });
  `;
  const goodCollector = `
        if (activationStatus === "deactivated") {
          await client.query(
            \`
              UPDATE mdata.drivers
              SET status_locked_at = now(),
                  status_locked_reason = 'samsara_deactivated',
                  updated_at = now()
              WHERE id = $1::uuid
            \`,
            [localDriverId, operatingCompanyId]
          );
        } else {
          await client.query(
            \`
              UPDATE mdata.drivers
              SET status_locked_at = NULL,
                  status_locked_reason = NULL,
                  updated_at = now()
              WHERE id = $1::uuid
                AND operating_company_id = $2::uuid
                AND status_locked_reason = 'samsara_deactivated'
            \`,
            [localDriverId, operatingCompanyId]
          );
        }
  `;
  const goodMigrations = ["202613980000_drivers_status_lock_prevents_auto_reactivation.sql"];
  const goodMigrationSrc = "ALTER TABLE mdata.drivers\n  ADD COLUMN IF NOT EXISTS status_locked_at timestamptz NULL,\n  ADD COLUMN IF NOT EXISTS status_locked_reason text NULL;";

  const realFs = fs.readFileSync;
  fs.readFileSync = (p, enc) => {
    if (String(p).endsWith(goodMigrations[0])) return goodMigrationSrc;
    return realFs(p, enc);
  };

  const base = { rule: goodRule, routes: goodRoutes, collector: goodCollector, migrations: goodMigrations };
  const cases = [
    { name: "good state", args: base, expectProblems: false },
    { name: "reactivate query drops status_locked_at gate", args: { ...base, rule: goodRule.replace("AND d.status_locked_at IS NULL\n", "") }, expectProblems: true },
    { name: "/deactivate no longer sets the lock", args: { ...base, routes: goodRoutes.replace("status_locked_at = now(),\n            status_locked_reason = 'manual_deactivate',\n            ", "") }, expectProblems: true },
    { name: "/reactivate no longer clears the lock", args: { ...base, routes: goodRoutes.replace("status_locked_at = NULL,\n              status_locked_reason = NULL,\n              ", "") }, expectProblems: true },
    { name: "collector no longer locks on Samsara deactivated", args: { ...base, collector: goodCollector.replace("status_locked_reason = 'samsara_deactivated',\n                  updated_at = now()\n              WHERE id = $1::uuid\n            `,\n            [localDriverId, operatingCompanyId]\n          );\n        } else {", "updated_at = now()\n              WHERE id = $1::uuid\n            `,\n            [localDriverId, operatingCompanyId]\n          );\n        } else {") }, expectProblems: true },
    { name: "collector clear no longer scoped to its own lock reason (would clear manual locks)", args: { ...base, collector: goodCollector.replace("AND status_locked_reason = 'samsara_deactivated'\n            `", "`") }, expectProblems: true },
    { name: "no migration file", args: { ...base, migrations: [] }, expectProblems: true },
  ];

  let failed = 0;
  for (const c of cases) {
    const problems = checkSources(c.args);
    const ok = (problems.length > 0) === c.expectProblems;
    if (!ok) failed += 1;
    console.log(`${ok ? "OK" : "FAIL"} [${c.name}] problems=${JSON.stringify(problems)}`);
  }
  fs.readFileSync = realFs;

  if (failed > 0) {
    console.error(`${LABEL} --selftest: ${failed}/${cases.length} mutation case(s) failed`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest: ${cases.length}/${cases.length} mutation case(s) PASS`);
}

async function liveCheck() {
  const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString || process.env.ENABLE_LIVE_DB_UNIT_TEST_GUARD !== "true") {
    const missing = !connectionString ? "DATABASE_URL is unset" : "ENABLE_LIVE_DB_UNIT_TEST_GUARD is not 'true'";
    console.log(`${LABEL}: static checks PASSED · SKIPPED-DB-CHECK (${missing}); the live simulated-reactivation-blocked scan did NOT run`);
    return;
  }
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  const { buildPgClientConfig } = require("./lib/pg-connection-options.cjs");
  const pg = require("pg");
  const client = new pg.Client(buildPgClientConfig(connectionString));
  await client.connect();
  try {
    await client.query("BEGIN");
    // Same posture as auth/db.ts's withLuciaBypass (the real cron's own wrapper): the non-superuser
    // app role, RLS bypassed via the explicit app.bypass_rls GUC, never an implicit superuser path.
    await client.query("SET LOCAL ROLE ih35_app").catch(() => {});
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
    const oci = (await client.query("SELECT id FROM org.companies LIMIT 1")).rows[0]?.id;
    if (!oci) throw new Error("no operating company found to scratch-test against");
    // A brand-new driver with created_at = now() matches the ACTIVITY_PREDICATE's new-hire grace
    // clause unconditionally — perfect for proving the LOCK, not the activity math, is what blocks it.
    const mkDriver = async () => {
      const res = await client.query(
        `INSERT INTO mdata.drivers (operating_company_id, first_name, last_name, phone, status, deactivated_at)
         VALUES ($1::uuid, 'CC3-GUARD-SCRATCH', 'drv-status-lock', '000-000-0000', 'Inactive', now())
         RETURNING id`,
        [oci]
      );
      return res.rows[0].id;
    };

    const lockedId = await mkDriver();
    await client.query(`UPDATE mdata.drivers SET status_locked_at = now(), status_locked_reason = 'manual_deactivate' WHERE id = $1`, [lockedId]);
    const unlockedId = await mkDriver();

    const { applyDriverActive30dRule } = await import(path.join(ROOT, "apps/backend/dist/mdata/driver-active-30d.service.js")).catch(() => ({}));
    if (typeof applyDriverActive30dRule !== "function") {
      console.log(`${LABEL}: static checks PASSED · SKIPPED-DB-CHECK (compiled driver-active-30d.service.js not found — build the backend first); the live simulated-reactivation-blocked scan did NOT run`);
      await client.query("ROLLBACK");
      return;
    }
    await applyDriverActive30dRule(client, oci);

    const rows = await client.query(`SELECT id::text, status FROM mdata.drivers WHERE id = ANY($1::uuid[])`, [[lockedId, unlockedId]]);
    const byId = Object.fromEntries(rows.rows.map((r) => [r.id, r.status]));
    const problems = [];
    if (byId[lockedId] !== "Inactive") problems.push(`locked scratch driver was reactivated to '${byId[lockedId]}' — status_locked_at did NOT block it`);
    if (byId[unlockedId] !== "Active") problems.push(`unlocked scratch driver was NOT reactivated (status='${byId[unlockedId]}') — the fix over-blocked a legitimate reactivation`);

    await client.query("ROLLBACK");

    if (problems.length) {
      console.error(`${LABEL}: LIVE CHECK FAILED — ${problems.join("; ")}`);
      process.exit(1);
    }
    console.log(`${LABEL}: LIVE CHECK PASS — locked scratch driver stayed Inactive through applyDriverActive30dRule; unlocked twin (identical activity signal) reactivated normally. Rolled back, nothing persisted.`);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

async function main() {
  if (process.argv.includes("--selftest")) return selftest();

  const rule = fs.readFileSync(path.join(ROOT, RULE_FILE), "utf8");
  const routes = fs.readFileSync(path.join(ROOT, ROUTES_FILE), "utf8");
  const collector = fs.readFileSync(path.join(ROOT, COLLECTOR_FILE), "utf8");
  const migrations = fs.readdirSync(path.join(ROOT, "db/migrations")).filter((f) => f.endsWith(".sql"));

  const problems = checkSources({ rule, routes, collector, migrations });
  if (problems.length) {
    console.error(`${LABEL} FAILED:`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL}: OK — reactivate query gates on status_locked_at, /deactivate + /reactivate + the Samsara collector all correctly set/clear it.`);

  await liveCheck();
}

main().catch((err) => {
  console.error(`${LABEL}: ERROR`, err);
  process.exit(1);
});
