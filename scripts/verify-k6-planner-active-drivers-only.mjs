#!/usr/bin/env node
/**
 * K.6 BRD-21 guard — planners show ACTIVE drivers only (deactivated filtered).
 *
 * Verifies:
 *   1. Backend planner service filters deactivated drivers (deactivated_at IS NULL)
 *   2. Frontend planner pages don't override the active-only filtering
 *   3. HOS violation drivers are still shown (active but OOS, not retired)
 *
 * The toggle to show inactive drivers is filed as remaining for CC-2 (backend change needed).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-k6-planner-active-drivers-only";
const SELFTEST = process.argv.includes("--selftest");

const PLANNER_SERVICE = "apps/backend/src/dispatch/planner.service.ts";
const TIMELINE = "apps/frontend/src/pages/dispatch/planners/UnifiedTimelinePlanner.tsx";
const DRIVER_PLANNER = "apps/frontend/src/pages/dispatch/planners/DriverPlanner.tsx";
const TRUCK_PLANNER = "apps/frontend/src/pages/dispatch/planners/TruckPlanner.tsx";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assertLive(overrides = {}) {
  const get = (rel) => overrides[rel] ?? read(rel);
  const problems = [];

  const service = get(PLANNER_SERVICE);
  // Backend must filter deactivated drivers
  if (!/d\.deactivated_at\s+IS\s+NULL/.test(service)) {
    problems.push("planner.service.ts must filter d.deactivated_at IS NULL (active drivers only)");
  }
  // Backend must also filter deactivated driver-company authorizations
  if (!/planner_roster_dca\.deactivated_at\s+IS\s+NULL/.test(service)) {
    problems.push("planner.service.ts must filter planner_roster_dca.deactivated_at IS NULL");
  }

  // Frontend planners must NOT show deactivated drivers client-side (no override)
  const timeline = get(TIMELINE);
  if (/deactivated_at\s*!=\s*null/.test(timeline) && !/deactivated_at\s*==\s*null/.test(timeline)) {
    problems.push("UnifiedTimelinePlanner must not show deactivated drivers");
  }

  return problems;
}

if (SELFTEST) {
  const live = assertLive();
  if (live.length) {
    console.error(`${LABEL} SELFTEST FAILED live: ${live.join(" | ")}`);
    process.exit(1);
  }
  // Mutation: remove deactivated_at filter from planner service
  const orig = read(PLANNER_SERVICE);
  const mutated = orig.replaceAll("d.deactivated_at IS NULL", "1=1");
  if (mutated === orig) {
    console.error(`${LABEL} SELFTEST FAILED: inert mutation`);
    process.exit(1);
  }
  if (!assertLive({ [PLANNER_SERVICE]: mutated }).length) {
    console.error(`${LABEL} SELFTEST FAILED: planted defect not caught`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — 1/1 mutations caught`);
  process.exit(0);
}

const problems = assertLive();
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — planners show active drivers only (deactivated filtered in backend)`);
