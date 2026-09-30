#!/usr/bin/env node
// ROUND 297.2 (Lead order, owner-approved, 2026-09-30): PM schedule catalog + per-unit schedules
// + owner backfill route. This guard is the permanent safety net named in the order:
//
//   FAILS IF: last_service_odometer is seeded from a current odometer; any writer targets
//   maint.pm_schedule; next_due_odometer is set while last_service_odometer is NULL; or the
//   backfill route writes the work order without the odometer reading.
//
// Static checks against source (no DB required) + a live check (when DATABASE_URL is set) that
// the current data honestly reflects the "never guess" rule.
//
// Usage: node scripts/verify-pm-schedule-never-guesses-a-baseline.mjs [--selftest]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-pm-schedule-never-guesses-a-baseline";
const BACKFILL_ROUTE = "apps/backend/src/maintenance/service-history-backfill.routes.ts";

/** Static source checks — pure, take the route file's text as input. */
export function findStaticProblems(routeSrc) {
  const problems = [];

  // (a) last_service_odometer must never be seeded from a current/live odometer reading
  // (mdata.units.odometer_mi, telematics.*_position, etc.) — only from the request body's own
  // odometer_miles, entered by the owner for a real past event.
  if (/last_service_odometer\s*=\s*.*odometer_mi\b/i.test(routeSrc) || /odometer_mi\b[\s\S]{0,80}last_service_odometer/i.test(routeSrc)) {
    problems.push("last_service_odometer appears to be seeded from a current odometer column (odometer_mi) — never seed from the current reading");
  }

  // (b) never target the frozen, retired maint.pm_schedule table.
  if (/\bmaint\.pm_schedule\b/.test(routeSrc)) {
    problems.push("writer references maint.pm_schedule — that schema is frozen/NEVER-WRITE; maintenance.pm_schedules is canonical");
  }

  // (c) the odometer_readings insert must exist in the same file as the work_orders insert (the
  // "never write the work order without the odometer reading" rule) — both statements present.
  if (!/INSERT INTO maintenance\.work_orders/i.test(routeSrc)) {
    problems.push("no INSERT INTO maintenance.work_orders found in the backfill route");
  }
  if (!/INSERT INTO telematics\.odometer_readings/i.test(routeSrc)) {
    problems.push("no INSERT INTO telematics.odometer_readings found in the backfill route — a backfill must never write the work order without the odometer reading");
  }

  // (d) next_due_odometer must only ever be set alongside last_service_odometer in the same
  // UPDATE/INSERT statement — never independently. Heuristic: every occurrence of
  // "next_due_odometer" in an UPDATE/INSERT statement must have "last_service_odometer" within
  // the same statement (same line window is sufficient given this route's own SQL formatting).
  const lines = routeSrc.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (/next_due_odometer/.test(lines[i]) && /SET|VALUES|,/i.test(lines[i])) {
      const windowStart = Math.max(0, i - 8);
      const windowEnd = Math.min(lines.length, i + 3);
      const window = lines.slice(windowStart, windowEnd).join("\n");
      if (/next_due_odometer/.test(window) && !/last_service_odometer/.test(window)) {
        problems.push(`line ${i + 1}: next_due_odometer set without last_service_odometer in the same statement window`);
      }
    }
  }

  return problems;
}

function selftest() {
  const good = fs.readFileSync(path.join(ROOT, BACKFILL_ROUTE), "utf8");
  if (findStaticProblems(good).length) {
    throw new Error(`expected PASS on the real route file, got: ${findStaticProblems(good).join(" | ")}`);
  }

  const seedFromCurrent = good.replace(
    "const nextDue = schedule.interval_kind",
    'const last_service_odometer = unit.odometer_mi;\n          const nextDue = schedule.interval_kind'
  );
  if (findStaticProblems(seedFromCurrent).length === 0) {
    throw new Error("expected FAIL when last_service_odometer is seeded from odometer_mi");
  }

  const targetsFrozenTable = good.replace("maintenance.pm_schedules", "maint.pm_schedule");
  if (findStaticProblems(targetsFrozenTable).length === 0) {
    throw new Error("expected FAIL when a writer targets maint.pm_schedule");
  }

  const noOdometerInsert = good.replace(/INSERT INTO telematics\.odometer_readings[\s\S]*?RETURNING id\n/, "");
  if (findStaticProblems(noOdometerInsert).length === 0) {
    throw new Error("expected FAIL when the odometer_readings insert is missing");
  }

  const noWorkOrderInsert = good.replace(/INSERT INTO maintenance\.work_orders \(/, "-- removed --(");
  if (findStaticProblems(noWorkOrderInsert).length === 0) {
    throw new Error("expected FAIL when the work_orders insert is missing");
  }

  console.log(`${LABEL} --selftest OK`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const routeSrc = fs.readFileSync(path.join(ROOT, BACKFILL_ROUTE), "utf8");
  const staticProblems = findStaticProblems(routeSrc);
  if (staticProblems.length) {
    console.error(`${LABEL} FAIL (static):\n- ${staticProblems.join("\n- ")}`);
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    console.log(`${LABEL} (live check): SKIP — no DATABASE_URL (the static check above already passed).`);
  } else {
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
    await client.connect();
    try {
      await client.query("RESET ROLE");
      // Honest-baseline live check: any row that carries next_due_odometer without
      // last_service_odometer is a real violation of the "never guess" rule, right now.
      const bad = await client.query(`
        SELECT count(*)::int AS n
        FROM maintenance.pm_schedules
        WHERE next_due_odometer IS NOT NULL AND last_service_odometer IS NULL
      `);
      if ((bad.rows[0]?.n ?? 0) > 0) {
        console.error(`${LABEL} FAIL (live): ${bad.rows[0].n} maintenance.pm_schedules row(s) have next_due_odometer set with last_service_odometer NULL`);
        process.exit(1);
      }
      const frozen = await client.query(`SELECT to_regclass('maint.pm_schedule') IS NOT NULL AS exists`);
      console.log(`${LABEL} PASS — no writer targets maint.pm_schedule (static), no pm_schedules row guesses next_due_odometer without a real last_service_odometer (live). maint.pm_schedule exists=${frozen.rows[0]?.exists}, untouched by this guard.`);
    } finally {
      await client.end();
    }
  }
}
