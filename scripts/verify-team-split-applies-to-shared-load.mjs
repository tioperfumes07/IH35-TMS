#!/usr/bin/env node
/**
 * CLOSURE-6 P5-T14 — team split config applies on shared load settlement.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const paths = {
  migration: path.join(ROOT, "apps/backend/src/migrations/0394-team-splits.sql"),
  routes: path.join(ROOT, "apps/backend/src/settlements/team-splits/team-splits.routes.ts"),
  apply: path.join(ROOT, "apps/backend/src/settlements/team-splits/apply.ts"),
  tests: path.join(ROOT, "apps/backend/src/settlements/team-splits/team-splits.test.ts"),
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
  const migration = read(paths.migration);
  const routes = read(paths.routes);
  const apply = read(paths.apply);
  const tests = read(paths.tests);
  const hook = read(paths.hook);
  const panel = read(paths.panel);
  const driversPage = read(paths.driversPage);

  if (!migration) fail("missing migration 0394-team-splits.sql");
  if (!routes) fail("missing team-splits.routes.ts");
  if (!apply) fail("missing apply.ts settlement hook");
  if (!tests) fail("missing team-splits.test.ts");
  if (!hook) fail("missing useTeamSplits.ts");
  if (!panel) fail("missing TeamSplitConfig.tsx");
  if (!driversPage) fail("missing DriversPage.tsx team splits sub-tab");

  if (!migration.includes("CREATE TABLE IF NOT EXISTS settlements.team_split_configs")) {
    fail("migration must create settlements.team_split_configs");
  }
  if (!migration.includes("team_split_load_overrides")) {
    fail("migration must create team_split_load_overrides");
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

  console.log("verify:team-split-applies-to-shared-load OK");
}

main();
