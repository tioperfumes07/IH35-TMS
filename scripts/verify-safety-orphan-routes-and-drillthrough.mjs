#!/usr/bin/env node
/**
 * GUARD: no mounted Safety route is unreachable, and two money/asset drill-throughs stay real.
 *
 * WHY THIS EXISTS (2026-07-23 audit — SAF-F22, F35, F23)
 *
 * F22: seven Safety routes were MOUNTED in routes/manifest.tsx with ZERO inbound links anywhere in
 * the app — Training Programs, Training Records, ELD Audit Trail, 425C Audit Trail, Photo Comparison,
 * Safety Reports, and the per-driver Safety Profile. They were real, working, built surfaces that an
 * operator could only reach by typing the URL. That is the quietest way for shipped work to be lost:
 * nothing errors, nothing is red, the page simply never gets opened. §7 is additive-only, so the fix
 * is an entry point, never a deletion.
 *
 * F35: after "Spawn WO" the accident drawer printed the WO's display id as PLAIN TEXT while the API
 * response already carried `spawned_wo_id` — a drill-through that existed in the payload and was
 * thrown away one line later.
 *
 * F23: the Escrow Record tab showed the driver as plain text on a money screen, so a driver's escrow
 * balance had no path back to the driver — even though the row's `id` IS the mdata.drivers id.
 *
 * The six non-parameterized orphans are registered as SAFETY_ALIAS_TABS, NOT SAFETY_GROUPS: the
 * groups array is the owner-locked canonical 28 (verify-safety-count-nav-integrity). Aliases render
 * as real NavLinks inside their group dropdown, which is what makes them reachable.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TABS_CONFIG = "apps/frontend/src/components/safety/SAFETY_TABS_CONFIG.ts";
const NAV = "apps/frontend/src/components/safety/SafetyGroupNav.tsx";
const DRIVER_SECTION = "apps/frontend/src/components/safety/DriverSafetyReverseSection.tsx";
const ENTITY_LINK = "apps/frontend/src/components/shared/EntityLink.tsx";
const ACCIDENT_DRAWER = "apps/frontend/src/components/safety/AccidentReportDrawer.tsx";
const ESCROW_TAB = "apps/frontend/src/pages/safety/tabs/EscrowRecordTab.tsx";
const FILES = [TABS_CONFIG, NAV, DRIVER_SECTION, ENTITY_LINK, ACCIDENT_DRAWER, ESCROW_TAB];
const LABEL = "verify-safety-orphan-routes-and-drillthrough";
const SELFTEST = process.argv.includes("--selftest");

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

/** The six previously-orphaned routes that must now be reachable from the Safety nav. */
const ORPHAN_ROUTES = [
  "/safety/training/programs",
  "/safety/training/records",
  "/safety/eld/audit-trail",
  "/safety/photo-comparison",
  "/safety/audit-425c",
  "/safety/reports",
];

export function assertSafetyOrphansAndDrillthrough(sources) {
  const src = {};
  for (const rel of FILES) src[rel] = stripComments(sources?.[rel] ?? read(rel));
  const problems = [];

  // 1. Every previously-orphaned route is registered as a nav entry.
  const aliasBlock = src[TABS_CONFIG].slice(src[TABS_CONFIG].indexOf("SAFETY_ALIAS_TABS"));
  for (const route of ORPHAN_ROUTES) {
    if (!aliasBlock.includes(`route: "${route}"`)) {
      problems.push(`${TABS_CONFIG}: ${route} is not in SAFETY_ALIAS_TABS — the route is mounted but has no nav entry, so it is unreachable except by typing the URL.`);
    }
  }

  // 2. The nav must actually RENDER aliases, or registering them changes nothing.
  if (!src[NAV].includes("SAFETY_ALIAS_TABS")) {
    problems.push(`${NAV}: does not merge SAFETY_ALIAS_TABS into the rendered groups — alias tabs would be registered but never shown.`);
  }

  // 3. The parameterized per-driver Safety Profile is linked from the driver's own page via EntityLink.
  if (
    !/kind="driver_safety_profile"[\s\S]{0,160}id=\{driverId\}/.test(src[DRIVER_SECTION]) ||
    !/case "driver_safety_profile":[\s\S]{0,120}\/safety\/driver-profiles\/\$\{id\}/.test(src[ENTITY_LINK])
  ) {
    problems.push(`${DRIVER_SECTION}: no link to /safety/driver-profiles/:driverId — that route is per-driver, cannot be a static nav entry, and the driver page is its only natural entry point.`);
  }

  // 4. Spawned WO drills through instead of printing a dead string.
  // SAF-B30: list may be hydrated from GET detail (setSpawnedWorkOrders) — still requires EntityLink
  // kind="work_order" with a real uuid id (wo.id / spawned_wo_id), not a display-id-only string.
  const drawer = src[ACCIDENT_DRAWER];
  const hasWoLink = /kind="work_order"/.test(drawer);
  const keepsUuid =
    /setSpawnedWorkOrders\(/.test(drawer) ||
    /setSpawnedWoId\(/.test(drawer) ||
    /id=\{wo\.id\}/.test(drawer) ||
    /id=\{spawnedWoId\}/.test(drawer);
  if (!hasWoLink || !keepsUuid) {
    problems.push(`${ACCIDENT_DRAWER}: the spawned work order is not an EntityLink kind="work_order" carrying spawned_wo_id — the API returns the uuid and it is being discarded.`);
  }

  // 5. Escrow driver drills through to the driver record.
  if (!/kind="driver"/.test(src[ESCROW_TAB])) {
    problems.push(`${ESCROW_TAB}: the Driver column is not an EntityLink kind="driver" — a money screen showing an unlinked driver name (row.id IS the mdata.drivers id).`);
  }

  return problems;
}

if (SELFTEST) {
  const live = Object.fromEntries(FILES.map((rel) => [rel, read(rel)]));
  const failures = [];
  const expectCaught = (name, mutated, needle) => {
    if (JSON.stringify(mutated) === JSON.stringify(live)) {
      failures.push(`${name}: inert mutation — the guard was never actually exercised`);
      return;
    }
    const problems = assertSafetyOrphansAndDrillthrough(mutated);
    if (!problems.some((p) => p.includes(needle))) {
      failures.push(`${name}: NOT caught (expected "${needle}", got: ${problems.join(" | ") || "none"})`);
    }
  };

  expectCaught(
    "orphan-route-loses-its-nav-entry",
    { ...live, [TABS_CONFIG]: live[TABS_CONFIG].replace('route: "/safety/audit-425c"', 'route: "/safety/somewhere-else"') },
    "/safety/audit-425c is not in SAFETY_ALIAS_TABS"
  );
  expectCaught(
    "nav-stops-rendering-aliases",
    { ...live, [NAV]: live[NAV].replace(/SAFETY_ALIAS_TABS/g, "SOME_OTHER_LIST") },
    "does not merge SAFETY_ALIAS_TABS"
  );
  expectCaught(
    "driver-safety-profile-link-removed",
    { ...live, [DRIVER_SECTION]: live[DRIVER_SECTION].replace(/kind="driver_safety_profile"/g, 'kind="driver"') },
    "no link to /safety/driver-profiles/:driverId"
  );
  expectCaught(
    "spawned-wo-back-to-plain-text",
    { ...live, [ACCIDENT_DRAWER]: live[ACCIDENT_DRAWER].replace(/kind="work_order"/g, 'kind="unit"') },
    "not an EntityLink kind=\"work_order\""
  );
  expectCaught(
    "escrow-driver-back-to-plain-text",
    { ...live, [ESCROW_TAB]: live[ESCROW_TAB].replace(/kind="driver"/g, 'kind="vendor"') },
    "not an EntityLink kind=\"driver\""
  );

  const liveProblems = assertSafetyOrphansAndDrillthrough(live);
  if (liveProblems.length) failures.push(`live sources FAIL (false positive): ${liveProblems.join(" | ")}`);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — 5 planted defects caught, live sources clean`);
  process.exit(0);
}

const problems = assertSafetyOrphansAndDrillthrough();
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — 6 orphaned Safety routes have nav entries, driver Safety Profile is linked, spawned WO + escrow driver drill through`);
