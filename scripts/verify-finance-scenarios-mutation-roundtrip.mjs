#!/usr/bin/env node
/** @matrix-built {"modules":["finance"],"cols":["connectivity"],"leafRe":"^(finance\\.overview|finance\\.projections|finance\\.scenarios)$","task":"LV-FINANCE-PLANNING-PLACEHOLDER-ROUTES"} */
/**
 * GUARD: the LV-FINANCE-PLANNING-PLACEHOLDER-ROUTES fix — /finance/overview, /finance/projections
 * and /finance/scenarios were static placeholders with zero data model, backend, or scoped read
 * (docs/audit/GUARD-WORKORDERS.md, audit rows 828-829). This asserts the full FE→BE→schema chain
 * this fix wired stays wired: the migration's versioned tables + FORCE RLS + gated flag, the
 * backend service's 6 operations, its 6 routes (flag + role gated), the frontend API client, and
 * that all three pages actually consume it (not still rendering the old static blurb).
 *
 * Real persistence/idempotency/RLS proof lives in scenarios.db.test.ts (real Postgres, CI-only) and
 * was rehearsed live on a Neon branch forked from prod before this migration was applied. This
 * guard is the fast, DB-less contract check that runs in the local gate on every push.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATION = "db/migrations/202612600000_finance_forecast_scenarios_data_model.sql";
const SERVICE = "apps/backend/src/finance/scenarios/scenarios.service.ts";
const ROUTES = "apps/backend/src/finance/scenarios/routes.ts";
const BACKEND_INDEX = "apps/backend/src/index.ts";
const FE_API = "apps/frontend/src/api/financeScenarios.ts";
const OVERVIEW_PAGE = "apps/frontend/src/pages/finance/FinanceOverviewPage.tsx";
const PROJECTIONS_PAGE = "apps/frontend/src/pages/finance/FinanceProjectionsPage.tsx";
const SCENARIOS_PAGE = "apps/frontend/src/pages/finance/FinanceScenariosPage.tsx";
const FILES = [MIGRATION, SERVICE, ROUTES, BACKEND_INDEX, FE_API, OVERVIEW_PAGE, PROJECTIONS_PAGE, SCENARIOS_PAGE];
const LABEL = "verify-finance-scenarios-mutation-roundtrip";

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

export function assertFinanceScenariosWired(sources) {
  const src = {};
  for (const rel of FILES) src[rel] = sources?.[rel] ?? read(rel);
  const problems = [];

  // 1. Migration: versioned tables, FORCE RLS both, void/supersede-not-delete, gated flag default OFF.
  if (!/CREATE TABLE IF NOT EXISTS finance\.forecast_scenarios/.test(src[MIGRATION])) problems.push(`${MIGRATION}: missing finance.forecast_scenarios table`);
  if (!/CREATE TABLE IF NOT EXISTS finance\.forecast_lines/.test(src[MIGRATION])) problems.push(`${MIGRATION}: missing finance.forecast_lines table`);
  if (!/^ALTER TABLE finance\.forecast_scenarios FORCE ROW LEVEL SECURITY;/m.test(src[MIGRATION])) problems.push(`${MIGRATION}: forecast_scenarios must FORCE RLS`);
  if (!/^ALTER TABLE finance\.forecast_lines FORCE ROW LEVEL SECURITY;/m.test(src[MIGRATION])) problems.push(`${MIGRATION}: forecast_lines must FORCE RLS`);
  if (!/status\s+text\s+NOT NULL DEFAULT 'draft'/.test(src[MIGRATION]) || !/superseded_by_scenario_id/.test(src[MIGRATION])) {
    problems.push(`${MIGRATION}: must be versioned draft/active/superseded with a supersede FK, not a mutable/deletable row`);
  }
  if (!/'FINANCE_HUB_SCENARIOS_ENABLED'[\s\S]{0,200}false/.test(src[MIGRATION])) problems.push(`${MIGRATION}: FINANCE_HUB_SCENARIOS_ENABLED must default OFF`);

  // 2. Backend service: the 6 operations this fix wired.
  for (const fn of ["createScenario", "listScenarios", "getScenarioDetail", "activateScenario", "recordLineActual", "getActiveScenarioSummary"]) {
    if (!new RegExp(`export async function ${fn}\\b`).test(src[SERVICE])) problems.push(`${SERVICE}: missing export ${fn}`);
  }
  if (!/assumption_note:\s*string/.test(src[SERVICE])) problems.push(`${SERVICE}: ForecastLineRecord must carry an explicit assumption_note`);

  // 3. Routes: flag-gated + role-gated for every write.
  if (!/registerFinanceScenariosRoutes/.test(src[ROUTES])) problems.push(`${ROUTES}: missing registerFinanceScenariosRoutes export`);
  const writeRoutePatterns = [/app\.post\("\/api\/v1\/finance\/scenarios"/, /app\.post\("\/api\/v1\/finance\/scenarios\/:scenarioId\/activate"/, /app\.patch\("\/api\/v1\/finance\/scenarios\/lines\/:lineId\/actual"/];
  for (const re of writeRoutePatterns) if (!re.test(src[ROUTES])) problems.push(`${ROUTES}: missing expected write route ${re}`);
  if ((src[ROUTES].match(/requireFlag\(/g) || []).length < 6) problems.push(`${ROUTES}: every endpoint must check the feature flag`);
  if ((src[ROUTES].match(/accountingRoles\(/g) || []).length < 3) problems.push(`${ROUTES}: every write endpoint must role-gate to Owner/Administrator/Accountant`);

  // 4. Backend index.ts actually mounts the routes.
  if (!/registerFinanceScenariosRoutes\(app\)/.test(src[BACKEND_INDEX])) problems.push(`${BACKEND_INDEX}: registerFinanceScenariosRoutes is never called`);

  // 5. Frontend API client mirrors the backend contract.
  for (const fn of ["listScenarios", "createScenario", "getScenarioDetail", "activateScenario", "recordLineActual", "getActiveScenarioSummary"]) {
    if (!new RegExp(`export function ${fn}\\b`).test(src[FE_API])) problems.push(`${FE_API}: missing export ${fn}`);
  }

  // 6. Every page consumes the real API — none may still be the static placeholder.
  if (!/getActiveScenarioSummary/.test(src[OVERVIEW_PAGE])) problems.push(`${OVERVIEW_PAGE}: must read the real active-scenario summary, not a static blurb`);
  if (/Future module/.test(src[OVERVIEW_PAGE])) problems.push(`${OVERVIEW_PAGE}: still contains the old placeholder copy`);
  if (!/getActiveScenarioSummary|getScenarioDetail/.test(src[PROJECTIONS_PAGE])) problems.push(`${PROJECTIONS_PAGE}: must read real scenario data, not a static blurb`);
  if (/not yet built|future module placeholder/i.test(src[PROJECTIONS_PAGE])) problems.push(`${PROJECTIONS_PAGE}: still contains the old placeholder copy`);
  if (!/createScenario/.test(src[SCENARIOS_PAGE]) || !/listScenarios/.test(src[SCENARIOS_PAGE])) problems.push(`${SCENARIOS_PAGE}: must create+list real scenarios, not a static blurb`);
  if (/not available yet|no working feature/i.test(src[SCENARIOS_PAGE])) problems.push(`${SCENARIOS_PAGE}: still contains the old placeholder copy`);
  if (!/Assumption \*/.test(src[SCENARIOS_PAGE])) problems.push(`${SCENARIOS_PAGE}: Assumption * required mark (FINANCE-HUB-SILENT-DISABLED-BUTTON)`);
  if (!/finance-scenario-submit-hint/.test(src[SCENARIOS_PAGE])) problems.push(`${SCENARIOS_PAGE}: disabled Create must expose submit hint (not a silent no-op)`);

  return problems;
}

function selftest() {
  const good = {};
  for (const rel of FILES) good[rel] = read(rel);
  const goodProblems = assertFinanceScenariosWired(good);
  if (goodProblems.length) {
    console.error(`${LABEL} SELFTEST FAIL — known-good real source flagged: ${goodProblems.join("; ")}`);
    process.exit(1);
  }

  const mutations = [
    { ...good, [MIGRATION]: good[MIGRATION].replace(/CREATE TABLE IF NOT EXISTS finance\.forecast_scenarios/, "CREATE TABLE IF NOT EXISTS finance.x_removed") },
    { ...good, [MIGRATION]: good[MIGRATION].replace(/FORCE ROW LEVEL SECURITY/, "-- FORCE ROW LEVEL SECURITY").replace(/FORCE ROW LEVEL SECURITY/, "-- FORCE ROW LEVEL SECURITY") },
    { ...good, [MIGRATION]: good[MIGRATION].replace("'FINANCE_HUB_SCENARIOS_ENABLED',\n  'LV-FINANCE-PLANNING-PLACEHOLDER-ROUTES", "'FINANCE_HUB_SCENARIOS_ENABLED_X',\n  'LV-FINANCE-PLANNING-PLACEHOLDER-ROUTES") },
    { ...good, [SERVICE]: good[SERVICE].replace("export async function activateScenario", "async function activateScenario") },
    { ...good, [ROUTES]: good[ROUTES].replace('app.post("/api/v1/finance/scenarios/:scenarioId/activate"', 'app.post("/api/v1/finance/scenarios/:scenarioId/x-activate"') },
    { ...good, [BACKEND_INDEX]: good[BACKEND_INDEX].replace("registerFinanceScenariosRoutes(app);", "") },
    { ...good, [FE_API]: good[FE_API].replace("export function createScenario", "function createScenario") },
    { ...good, [OVERVIEW_PAGE]: good[OVERVIEW_PAGE].replace(/getActiveScenarioSummary/g, "removedCall") },
    { ...good, [SCENARIOS_PAGE]: good[SCENARIOS_PAGE].replace(/createScenario/g, "removedCall") },
    { ...good, [SCENARIOS_PAGE]: good[SCENARIOS_PAGE].replace("Assumption *", "Assumption") },
    { ...good, [SCENARIOS_PAGE]: good[SCENARIOS_PAGE].replace(/finance-scenario-submit-hint/g, "x-hint") },
  ];
  for (const [i, mutated] of mutations.entries()) {
    if (assertFinanceScenariosWired(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — mutation ${i} escaped detection`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} mutations all detected`);
  process.exit(0);
}

if (process.argv.includes("--selftest")) selftest();

const failures = assertFinanceScenariosWired();
if (failures.length) {
  console.error(`${LABEL} FAIL:\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS`);
