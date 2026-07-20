#!/usr/bin/env node
/**
 * verify-drivers-subnav-routes-registered — every Drivers extended subnav path has a Route.
 *
 * Owns 0441-mod5-auto-deductions-team-splits-dead: NavLinks to /drivers/auto-deductions and
 * /drivers/team-splits must not fall through to the catch-all Navigate home.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-drivers-subnav-routes-registered";
const DRIVERS_PAGE = "apps/frontend/src/pages/drivers/DriversPage.tsx";
const ROUTE_MANIFEST = "apps/frontend/src/router/route-manifest.ts";
const ROUTES = "apps/frontend/src/routes/manifest.tsx";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function extractSubnavPaths(driversPageSrc, routeManifestSrc) {
  const paths = new Set();
  // Explicit EXTENDED_SUBNAV constants on DriversPage
  for (const m of driversPageSrc.matchAll(/=\s*["'](\/drivers\/[^"']+)["']/g)) {
    paths.add(m[1]);
  }
  // DRIVERS_SUBTAB_PATH values used by EXTENDED_SUBNAV via DRIVERS_SUBNAV
  for (const m of routeManifestSrc.matchAll(/:\s*["'](\/drivers\/[^"']+)["']/g)) {
    paths.add(m[1]);
  }
  // Root /drivers from DRIVERS_SUBTAB_PATH.drivers
  if (/drivers:\s*["']\/drivers["']/.test(routeManifestSrc)) {
    paths.add("/drivers");
  }
  return [...paths].sort();
}

function manifestHasRoute(manifest, routePath) {
  const escaped = routePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`path=["']${escaped}["']`).test(manifest);
}

function assertRegistered({ driversPage, routeManifest, manifest }) {
  const errors = [];
  if (!driversPage) errors.push(`${DRIVERS_PAGE} missing`);
  if (!routeManifest) errors.push(`${ROUTE_MANIFEST} missing`);
  if (!manifest) errors.push(`${ROUTES} missing`);
  if (errors.length) return errors;

  const required = extractSubnavPaths(driversPage, routeManifest);
  if (!required.includes("/drivers/auto-deductions")) {
    errors.push("DriversPage must declare /drivers/auto-deductions");
  }
  if (!required.includes("/drivers/team-splits")) {
    errors.push("DriversPage must declare /drivers/team-splits");
  }
  for (const routePath of required) {
    if (!manifestHasRoute(manifest, routePath)) {
      errors.push(`${ROUTES}: missing <Route path="${routePath}"> for Drivers subnav`);
    }
  }
  return errors;
}

function selftest() {
  const driversPage = `
    export const DRIVERS_AUTO_DEDUCTIONS_SUBTAB_PATH = "/drivers/auto-deductions";
    export const DRIVERS_TEAM_SPLITS_SUBTAB_PATH = "/drivers/team-splits";
    export const DRIVERS_DISPUTES_SUBTAB_PATH = "/drivers/disputes";
  `;
  const routeManifest = `
    export const DRIVERS_SUBTAB_PATH = {
      drivers: "/drivers",
      profiles: "/drivers/profiles",
      leave: "/drivers/leave",
    };
  `;
  const goodManifest = `
    path="/drivers"
    path="/drivers/profiles"
    path="/drivers/leave"
    path="/drivers/auto-deductions"
    path="/drivers/team-splits"
    path="/drivers/disputes"
  `;
  const badManifest = goodManifest.replace('path="/drivers/auto-deductions"\n', "");
  if (assertRegistered({ driversPage, routeManifest, manifest: goodManifest }).length) {
    console.error(`${LABEL} SELFTEST FAILED — good fixture rejected`);
    process.exit(1);
  }
  if (!assertRegistered({ driversPage, routeManifest, manifest: badManifest }).some((e) => e.includes("auto-deductions"))) {
    console.error(`${LABEL} SELFTEST FAILED — missing auto-deductions not caught`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const errors = assertRegistered({
  driversPage: read(DRIVERS_PAGE),
  routeManifest: read(ROUTE_MANIFEST),
  manifest: read(ROUTES),
});
if (errors.length) {
  console.error(`${LABEL}: FAIL`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — ${extractSubnavPaths(read(DRIVERS_PAGE), read(ROUTE_MANIFEST)).length} drivers subnav paths registered`);
process.exit(0);
