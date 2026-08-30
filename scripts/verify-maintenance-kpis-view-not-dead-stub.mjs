#!/usr/bin/env node
/**
 * GO-1405 P1 (owner packet IH35-FINISH-2026-08-29/CC-1) -- static-shape guard asserting
 * views.maintenance_dashboard_kpis is no longer the permanent `SELECT ... WHERE false` stub
 * that 0041_p3_t11_6_maintenance_rebuild.sql fell into (its schema-detection branch checked for
 * a total_estimated_cost/total_cost column that never existed on maintenance.work_orders, so
 * every read of the view -- mtd_repair_cost, in_shop, avg_wo_age_days, avg_wo_cost -- silently
 * returned 0 regardless of real work-order data). Live proof: 3 completed August 2026 repair
 * work orders totaling $345.00 produced mtd_repair_cost=0 before this fix.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";

const migrationsDir = "db/migrations";

function findMigrationSrc() {
  if (!existsSync(migrationsDir)) return null;
  const hit = readdirSync(migrationsDir).find((f) => f.includes("maintenance_kpis_view_dead_where_false_fix"));
  return hit ? readFileSync(`${migrationsDir}/${hit}`, "utf8") : null;
}

function stripSqlComments(text) {
  return text
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
}

function analyze(migration) {
  const failures = [];

  if (!migration) {
    failures.push("no db/migrations/*maintenance_kpis_view_dead_where_false_fix*.sql found");
    return failures;
  }

  const sqlOnly = stripSqlComments(migration);
  if (/WHERE false/.test(sqlOnly)) {
    failures.push("migration still contains the dead WHERE false stub -- the view must be replaced, not preserved");
  }

  if (!/CREATE OR REPLACE VIEW views\.maintenance_dashboard_kpis/.test(migration)) {
    failures.push("migration does not CREATE OR REPLACE views.maintenance_dashboard_kpis");
  }

  if (!/security_invoker = true/.test(migration)) {
    failures.push("migration's view is missing security_invoker=true (CLAUDE.md S2 RLS invariant)");
  }

  if (!/AS mtd_repair_cost/.test(migration) || !/wo_type = 'repair'/.test(migration)) {
    failures.push("migration's view no longer computes a real mtd_repair_cost aggregate from wo_type='repair' rows");
  }

  if (!/COALESCE\(total_actual_cost, COALESCE\(estimated_cost_cents, 0\)::numeric \/ 100\.0\)/.test(migration)) {
    failures.push(
      "migration's cost expression no longer matches getCriticalWorkOrderKpis()'s COALESCE(total_actual_cost, estimated_cost_cents/100.0) pattern"
    );
  }

  if (!/voided_at IS NULL/.test(migration)) {
    failures.push("migration's view has no voided_at exclusion (void-not-delete law)");
  }

  return failures;
}

function selftest() {
  const migration = findMigrationSrc();
  const good = analyze(migration);
  if (good.length > 0) {
    console.error("verify-maintenance-kpis-view-not-dead-stub --selftest: FAIL on the real (good) file");
    for (const f of good) console.error(`  - ${f}`);
    process.exit(1);
  }

  const mutations = [
    {
      name: "WHERE false stub reintroduced",
      apply: (m) => m.replace("FROM maintenance.work_orders\nGROUP BY operating_company_id;", "WHERE false;"),
    },
    {
      name: "security_invoker removed",
      apply: (m) => m.replace("WITH (security_invoker = true) ", ""),
    },
    {
      name: "mtd_repair_cost wo_type filter removed",
      apply: (m) => m.replace("wo_type = 'repair'\n      AND ", ""),
    },
    {
      name: "cost fallback expression replaced with a different formula",
      apply: (m) => m.replace(/COALESCE\(total_actual_cost, COALESCE\(estimated_cost_cents, 0\)::numeric \/ 100\.0\)/g, "0"),
    },
    {
      name: "voided_at exclusion removed",
      apply: (m) => m.replace(/\n\s*AND voided_at IS NULL/g, ""),
    },
  ];

  let allCaught = true;
  for (const m of mutations) {
    const mutated = m.apply(migration);
    const failures = analyze(mutated);
    if (failures.length === 0) {
      console.error(`verify-maintenance-kpis-view-not-dead-stub --selftest: NOT CAUGHT -- ${m.name}`);
      allCaught = false;
    } else {
      console.log(`  caught: ${m.name}`);
    }
  }

  if (!allCaught) process.exit(1);
  console.log(`SELFTEST PASS: ${mutations.length}/${mutations.length} planted regressions caught and repository restored green.`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const migration = findMigrationSrc();
  const failures = analyze(migration);
  if (failures.length > 0) {
    console.error("verify-maintenance-kpis-view-not-dead-stub: FAIL");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(
    "verify-maintenance-kpis-view-not-dead-stub: OK -- views.maintenance_dashboard_kpis replaces the dead WHERE false stub with real per-company aggregates (security_invoker, voided_at-excluding, matching the route's own cost-fallback expression)"
  );
}
