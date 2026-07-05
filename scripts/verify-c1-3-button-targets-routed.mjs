#!/usr/bin/env node
/**
 * Static guard: C1-3 dead-end buttons stay wired.
 *
 * Audit finding C1-3 (Frontend/Routing): three live buttons dead-ended to Home because their
 * `to=` targets had no matching route in the manifest — two orphan pages (FraudAlertsListPage,
 * DriverLayoverHistory) that existed but were never routed, plus one path typo
 * (/maintenance/severe-repair-oos instead of /maintenance/severe-repairs).
 *
 * This guard fails CI if any of the three known button targets regresses: either the source link
 * reverts to a bad path, or its target route disappears from the manifest. Per locked rule:
 * "every bug fix gets a static CI guard."
 */
import { readFileSync } from "node:fs";

const MANIFEST = "apps/frontend/src/routes/manifest.tsx";
const manifest = readFileSync(MANIFEST, "utf8");

// Every literal route path declared in the manifest (path="/foo/:id").
const routePaths = new Set();
const pathRe = /path=["'`](\/[a-zA-Z0-9_\-/:*]*)["'`]/g;
let pm;
while ((pm = pathRe.exec(manifest))) routePaths.add(pm[1]);

// Each check: the source file must contain `linkMustContain`, must NOT contain `linkMustNotContain`
// (guards the typo), and the manifest must declare `route`.
const checks = [
  {
    name: "Fuel Home → Fraud Alerts",
    file: "apps/frontend/src/pages/fuel/FuelHome.tsx",
    linkMustContain: 'to="/fuel/fraud-alerts"',
    route: "/fuel/fraud-alerts",
  },
  {
    name: "Home Fleet Restore card → Severe Repairs OOS",
    file: "apps/frontend/src/pages/home/HomeFleetRestoreCard.tsx",
    linkMustContain: 'to="/maintenance/severe-repairs"',
    linkMustNotContain: "/maintenance/severe-repair-oos",
    route: "/maintenance/severe-repairs",
  },
  {
    name: "Driver profile Layovers card → Layover history",
    file: "apps/frontend/src/pages/drivers/DriverProfilePage.tsx",
    linkMustContain: "/dispatch/layovers/driver/",
    route: "/dispatch/layovers/driver/:driverId",
  },
];

const errors = [];
for (const c of checks) {
  let src;
  try {
    src = readFileSync(c.file, "utf8");
  } catch {
    errors.push(`${c.name}: source file missing (${c.file})`);
    continue;
  }
  if (!src.includes(c.linkMustContain)) {
    errors.push(`${c.name}: ${c.file} no longer links to "${c.linkMustContain}" (button would dead-end).`);
  }
  if (c.linkMustNotContain && src.includes(c.linkMustNotContain)) {
    errors.push(`${c.name}: ${c.file} still contains the dead path "${c.linkMustNotContain}".`);
  }
  if (!routePaths.has(c.route)) {
    errors.push(`${c.name}: manifest has no route for "${c.route}" — button target is orphaned.`);
  }
}

if (errors.length) {
  console.error("verify-c1-3-button-targets-routed: FAIL");
  for (const e of errors) console.error(`  ✗ ${e}`);
  console.error("\nFix: keep each button's link path in sync with a real manifest route (do not reintroduce the typo).");
  process.exit(1);
}

console.log(`verify-c1-3-button-targets-routed: OK — ${checks.length} button targets routed.`);
