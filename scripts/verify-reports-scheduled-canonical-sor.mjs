#!/usr/bin/env node
/**
 * verify-reports-scheduled-canonical-sor.mjs — LV-REPORTS-CUSTOM-SCHEDULER-CANONICAL-SOR-UNMOUNTED
 * (owner-locked §9.6: "reporting.* canonical for scheduled reports — migrate reports.* rows in,
 * archive the old").
 *
 * Asserts the shipped canonicalization:
 *   1. Migration adds recipient_roles + void fields to reporting.scheduled_reports, widens
 *      created_by_user_id nullable + frequency CHECK to include 'quarterly', and migrates the
 *      legacy reports.scheduled_reports rows in (idempotent, id-preserving).
 *   2. index.ts mounts registerScheduledReportsRoutes + initializeScheduledReportsWorker (the
 *      canonical engine was fully built but never wired in).
 *   3. The canonical DELETE route is void-not-delete (UPDATE voided_at, never a bare DELETE
 *      statement), and the GET list excludes voided rows.
 *   4. 'quarterly' is a genuine first-class frequency in next-run.ts (computeNextRunAt +
 *      computeDeliveryPeriod), not a synthetic cron string.
 *
 * Usage:
 *   node scripts/verify-reports-scheduled-canonical-sor.mjs            # scan
 *   node scripts/verify-reports-scheduled-canonical-sor.mjs --selftest # inject regressions -> must FAIL
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-reports-scheduled-canonical-sor";

const MIGRATION = "db/migrations/202612570000_reports_scheduled_canonicalize.sql";
const INDEX_TS = "apps/backend/src/index.ts";
const ROUTES = "apps/backend/src/scheduled-reports/scheduled-reports.routes.ts";
const NEXT_RUN = "apps/backend/src/scheduled-reports/next-run.ts";

function readRel(root, rel, overrides) {
  if (overrides && Object.prototype.hasOwnProperty.call(overrides, rel)) return overrides[rel];
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

export function collectProblems(root = ROOT, overrides = null) {
  const problems = [];

  const migration = readRel(root, MIGRATION, overrides);
  if (!migration) {
    problems.push(`missing ${MIGRATION}`);
  } else {
    if (!/ADD COLUMN IF NOT EXISTS recipient_roles text\[\]/.test(migration)) problems.push(`${MIGRATION}: must add recipient_roles`);
    if (!/ADD COLUMN IF NOT EXISTS voided_at timestamptz/.test(migration)) problems.push(`${MIGRATION}: must add voided_at`);
    if (!/ALTER COLUMN created_by_user_id DROP NOT NULL/.test(migration)) problems.push(`${MIGRATION}: must widen created_by_user_id nullable`);
    if (!/'quarterly'/.test(migration) || !/scheduled_reports_frequency_check/.test(migration)) problems.push(`${MIGRATION}: frequency CHECK must include 'quarterly'`);
    if (!/INSERT INTO reporting\.scheduled_reports/.test(migration) || !/FROM reports\.scheduled_reports/.test(migration)) {
      problems.push(`${MIGRATION}: must migrate rows from reports.scheduled_reports into reporting.scheduled_reports`);
    }
    if (!/ON CONFLICT \(id\) DO NOTHING/.test(migration)) problems.push(`${MIGRATION}: row migration must be idempotent (ON CONFLICT (id) DO NOTHING)`);
  }

  const indexTs = readRel(root, INDEX_TS, overrides);
  if (!indexTs) {
    problems.push(`missing ${INDEX_TS}`);
  } else {
    if (!/registerScheduledReportsRoutes\(app\)/.test(indexTs)) problems.push(`${INDEX_TS}: must mount registerScheduledReportsRoutes`);
    if (!/initializeScheduledReportsWorker\(app\)/.test(indexTs)) problems.push(`${INDEX_TS}: must initialize the canonical worker`);
  }

  const routes = readRel(root, ROUTES, overrides);
  if (!routes) {
    problems.push(`missing ${ROUTES}`);
  } else {
    if (/DELETE FROM reporting\.scheduled_reports/.test(routes)) problems.push(`${ROUTES}: DELETE route must never hard-delete (void-not-delete)`);
    const deleteHandler = routes.match(/app\.delete\("\/api\/v1\/scheduled-reports\/:id"[\s\S]*?\n  \}\);/);
    if (!deleteHandler) {
      problems.push(`${ROUTES}: could not locate the DELETE handler`);
    } else if (!/voided_at = now\(\)/.test(deleteHandler[0])) {
      problems.push(`${ROUTES}: DELETE handler must set voided_at (void-not-delete)`);
    }
    const listHandler = routes.match(/app\.get\("\/api\/v1\/scheduled-reports",[\s\S]*?\n  \}\);/);
    if (!listHandler) {
      problems.push(`${ROUTES}: could not locate the GET list handler`);
    } else if (!/voided_at IS NULL/.test(listHandler[0])) {
      problems.push(`${ROUTES}: GET list must exclude voided rows`);
    }
    if (!/"quarterly"/.test(routes)) problems.push(`${ROUTES}: frequencySchema must accept 'quarterly'`);
  }

  const nextRun = readRel(root, NEXT_RUN, overrides);
  if (!nextRun) {
    problems.push(`missing ${NEXT_RUN}`);
  } else {
    if (!/type ScheduleFrequency = "daily" \| "weekly" \| "monthly" \| "quarterly" \| "cron"/.test(nextRun)) {
      problems.push(`${NEXT_RUN}: ScheduleFrequency must include 'quarterly'`);
    }
    if (!/input\.frequency === "quarterly"/.test(nextRun)) problems.push(`${NEXT_RUN}: computeNextRunAt must handle 'quarterly' directly (not a synthetic cron string)`);
    if (!/frequency === "quarterly"/.test(nextRun.slice(nextRun.indexOf("computeDeliveryPeriod")))) {
      problems.push(`${NEXT_RUN}: computeDeliveryPeriod must handle 'quarterly' directly`);
    }
  }

  return problems;
}

export function run() {
  const problems = collectProblems();
  if (problems.length) {
    console.error(`${LABEL}: FAIL`);
    for (const p of problems) console.error(`  - ${p}`);
    return { ok: false, offenders: problems };
  }
  console.log(`${LABEL}: PASS — canonical scheduled-reports engine mounted, migrated, void-not-delete, quarterly first-class`);
  return { ok: true, offenders: [] };
}

function selftest() {
  const baseline = collectProblems();
  if (baseline.length) {
    console.error(`${LABEL} SELFTEST FAIL (baseline must be clean):`);
    for (const p of baseline) console.error("  - " + p);
    process.exit(1);
  }

  const migrationReal = readRel(ROOT, MIGRATION);
  const indexReal = readRel(ROOT, INDEX_TS);
  const routesReal = readRel(ROOT, ROUTES);
  const nextRunReal = readRel(ROOT, NEXT_RUN);

  const plant = (label, overrides, expectFragment) => {
    const problems = collectProblems(ROOT, overrides);
    if (!problems.some((p) => p.includes(expectFragment))) {
      console.error(`${LABEL} SELFTEST FAIL: planted regression "${label}" was NOT caught`);
      process.exit(1);
    }
  };

  plant(
    "migration-drops-row-migration",
    { [MIGRATION]: migrationReal.replace("ON CONFLICT (id) DO NOTHING", "-- removed") },
    "must be idempotent"
  );
  plant(
    "migration-drops-void-fields",
    { [MIGRATION]: migrationReal.replace("ADD COLUMN IF NOT EXISTS voided_at timestamptz,", "") },
    "must add voided_at"
  );
  plant(
    "index-drops-route-mount",
    { [INDEX_TS]: indexReal.replace("  await registerScheduledReportsRoutes(app);\n", "") },
    "must mount registerScheduledReportsRoutes"
  );
  plant(
    "index-drops-worker-init",
    { [INDEX_TS]: indexReal.replace("    initializeScheduledReportsWorker(app);\n", "") },
    "must initialize the canonical worker"
  );
  plant(
    "route-reverts-to-hard-delete",
    {
      [ROUTES]: routesReal.replace(
        /UPDATE reporting\.scheduled_reports\s*\n\s*SET voided_at = now\(\), voided_by_user_id = \$2::uuid, status = 'paused'\s*\n\s*WHERE id = \$1::uuid AND operating_company_id = \$3::uuid AND voided_at IS NULL\s*\n\s*RETURNING id/,
        "DELETE FROM reporting.scheduled_reports WHERE id=$1 RETURNING id"
      ),
    },
    "must never hard-delete"
  );
  plant(
    "list-drops-voided-exclusion",
    { [ROUTES]: routesReal.replace(`[\`operating_company_id = $1::uuid\`, \`voided_at IS NULL\`]`, "[`operating_company_id = $1::uuid`]") },
    "must exclude voided rows"
  );
  plant(
    "next-run-drops-quarterly-type",
    { [NEXT_RUN]: nextRunReal.replace('"daily" | "weekly" | "monthly" | "quarterly" | "cron"', '"daily" | "weekly" | "monthly" | "cron"') },
    "ScheduleFrequency must include"
  );

  console.log(`${LABEL} SELFTEST PASS — 7 planted regressions all caught`);
}

const isMain = path.resolve(process.argv[1] ?? "") === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  if (process.argv.includes("--selftest")) selftest();
  else process.exit(run().ok ? 0 : 1);
}
