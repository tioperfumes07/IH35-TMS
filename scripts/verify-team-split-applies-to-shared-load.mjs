#!/usr/bin/env node
/**
 * CLOSURE-6 P5-T14 — team split config applies on shared load settlement.
 *
 * P2b/P2f update (owner ruling DECISION 2 Option A, 2026-07-21): config/override truth is
 * canonical mdata.driver_teams (+ additive mdata.loads override columns). This guard now pins
 * the CONVERGED state: plural endpoints stay (never-delete facade), apply.ts + routes resolve
 * against mdata.driver_teams, and the facade is MOUNTED in index.ts (the old unmounted routes
 * were a live 404 on the Drivers Team Splits panel). Companion zero-RETIRE-refs guard:
 * scripts/verify-no-settlements-team-split-refs.mjs.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const paths = {
  routes: path.join(ROOT, "apps/backend/src/settlements/team-splits/team-splits.routes.ts"),
  apply: path.join(ROOT, "apps/backend/src/settlements/team-splits/apply.ts"),
  tests: path.join(ROOT, "apps/backend/src/settlements/team-splits/team-splits.test.ts"),
  index: path.join(ROOT, "apps/backend/src/index.ts"),
  hook: path.join(ROOT, "apps/frontend/src/hooks/useTeamSplits.ts"),
  panel: path.join(ROOT, "apps/frontend/src/pages/drivers/TeamSplitConfig.tsx"),
  driversPage: path.join(ROOT, "apps/frontend/src/pages/drivers/DriversPage.tsx"),
};

function read(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, "utf8");
}

function fail(message) {
  console.error(`verify:team-split-applies-to-shared-load FAILED\n- ${message}`);
  process.exit(1);
}

function main() {
  const routes = read(paths.routes);
  const apply = read(paths.apply);
  const tests = read(paths.tests);
  const index = read(paths.index);
  const hook = read(paths.hook);
  const panel = read(paths.panel);
  const driversPage = read(paths.driversPage);

  if (!routes) fail("missing team-splits.routes.ts");
  if (!apply) fail("missing apply.ts settlement hook");
  if (!tests) fail("missing team-splits.test.ts");
  if (!index) fail("missing apps/backend/src/index.ts");
  if (!hook) fail("missing useTeamSplits.ts");
  if (!panel) fail("missing TeamSplitConfig.tsx");
  if (!driversPage) fail("missing DriversPage.tsx team splits sub-tab");

  // Converged truth: facade + resolver read/write canonical mdata.driver_teams, never the
  // RETIRE settlements-namespace config tables.
  if (!routes.includes("mdata.driver_teams") && !routes.includes("driver-team.service")) {
    fail("routes must facade over mdata.driver_teams (owner ruling DECISION 2, 2026-07-21)");
  }
  if (!apply.includes("mdata.driver_teams")) {
    fail("apply.ts must resolve splits from mdata.driver_teams (owner ruling DECISION 2, 2026-07-21)");
  }
  if (/settlements\.team_split_(configs|load_overrides)\b/.test(routes)) {
    fail("routes must not reference RETIRE settlements team-split tables");
  }
  if (/settlements\.team_split_(configs|load_overrides)\b/.test(apply)) {
    fail("apply.ts must not reference RETIRE settlements team-split tables");
  }
  if (!index.includes("registerTeamSplitRoutes")) {
    fail("index.ts must mount registerTeamSplitRoutes (unmounted facade = live 404 on Team Splits panel)");
  }

  if (!routes.includes('app.post("/api/v1/team-splits/configs"')) {
    fail("routes must expose POST /api/v1/team-splits/configs");
  }
  if (!routes.includes('app.get("/api/v1/team-splits/configs"')) {
    fail("routes must expose GET /api/v1/team-splits/configs");
  }
  if (!routes.includes('app.post("/api/v1/loads/:id/team-split"')) {
    fail("routes must expose POST /api/v1/loads/:id/team-split");
  }

  if (!apply.includes("applyTeamSplitsForSettlement")) {
    fail("apply.ts must export settlement-time hook");
  }
  if (!apply.includes("team_split_primary")) {
    fail("apply.ts must create team_split_primary line items");
  }
  if (!apply.includes("team_split_secondary")) {
    fail("apply.ts must create team_split_secondary line items");
  }

  if (!tests.includes("applyTeamSplitsForSettlement")) {
    fail("tests must cover settlement-time team split application");
  }

  if (!hook.includes("/api/v1/team-splits/configs")) {
    fail("useTeamSplits must call team-splits API");
  }

  if (!driversPage.includes("drivers-team-splits-tab")) {
    fail("DriversPage must render Team Splits sub-tab");
  }
  if (!panel.includes("Create config")) {
    fail("TeamSplitConfig must include create config UI");
  }
  if (!/isError[\s\S]*?<ListErrorState[\s\S]*?refetch\(\)/.test(panel)) {
    fail("TeamSplitConfig must render a retryable ListErrorState when the configs query fails");
  }

  console.log("verify:team-split-applies-to-shared-load OK");
}

main();
