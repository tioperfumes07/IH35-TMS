#!/usr/bin/env node
/**
 * GUARD: SAF-F22 — every previously orphan-mounted Safety route has a real inbound nav entry.
 *
 * ROOT CAUSE (2026-07-23 audit S-A34…S-A40): seven Safety routes were registered in
 * routes/manifest.tsx with ZERO inbound links — operators could only reach them by typing URLs.
 *
 * FIX: six static routes live in SAFETY_ALIAS_TABS (merged into SafetyGroupNav dropdowns without
 * touching the owner-locked canonical 28); the parameterized driver Safety Profile is linked from
 * DriverSafetyReverseSection on each driver page; Safety Home exposes alias quick-jumps.
 *
 * This guard FAILS if any of those entry points regress.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TABS_CONFIG = "apps/frontend/src/components/safety/SAFETY_TABS_CONFIG.ts";
const GROUP_NAV = "apps/frontend/src/components/safety/SafetyGroupNav.tsx";
const LAYOUT = "apps/frontend/src/pages/safety/SafetyLayout.tsx";
const HOME_TAB = "apps/frontend/src/pages/safety/tabs/SafetyHomeTab.tsx";
const DRIVER_SECTION = "apps/frontend/src/components/safety/DriverSafetyReverseSection.tsx";
const MANIFEST = "apps/frontend/src/routes/manifest.tsx";

const FILES = [TABS_CONFIG, GROUP_NAV, LAYOUT, HOME_TAB, DRIVER_SECTION, MANIFEST];
const LABEL = "verify-safety-f22-orphan-nav-reachability";
const SELFTEST = process.argv.includes("--selftest");

/** S-A34…S-A40 — the seven orphan-mounted surfaces from Desktop safety.md §A.2. */
const STATIC_ORPHAN_ROUTES = [
  { id: "audit-425c", route: "/safety/audit-425c", groupId: "compliance-monitoring" },
  { id: "safety-reports", route: "/safety/reports", groupId: "compliance-monitoring" },
  { id: "training-programs", route: "/safety/training/programs", groupId: "driver-files" },
  { id: "training-records", route: "/safety/training/records", groupId: "driver-files" },
  { id: "eld-audit-trail", route: "/safety/eld/audit-trail", groupId: "hours-fatigue" },
  { id: "photo-comparison", route: "/safety/photo-comparison", groupId: "incidents-claims" },
];

const DRIVER_PROFILE_ROUTE_PATTERN = /\/safety\/driver-profiles\/\$\{driverId\}/;

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

export function assertSafetyF22OrphanNavReachability(sources) {
  const src = {};
  for (const rel of FILES) src[rel] = stripComments(sources?.[rel] ?? read(rel));
  const problems = [];

  const aliasBlock = src[TABS_CONFIG].slice(src[TABS_CONFIG].indexOf("SAFETY_ALIAS_TABS"));

  // 1. Each static orphan route is registered in SAFETY_ALIAS_TABS under the correct group.
  for (const { id, route, groupId } of STATIC_ORPHAN_ROUTES) {
    if (!aliasBlock.includes(`route: "${route}"`)) {
      problems.push(`${TABS_CONFIG}: ${route} (${id}) missing from SAFETY_ALIAS_TABS — mounted but unreachable.`);
      continue;
    }
    const groupNeedle = `groupId: "${groupId}"`;
    const routeIdx = aliasBlock.indexOf(`route: "${route}"`);
    const window = aliasBlock.slice(Math.max(0, routeIdx - 200), routeIdx + 80);
    if (!window.includes(groupNeedle)) {
      problems.push(`${TABS_CONFIG}: ${route} (${id}) not grouped under ${groupId} — wrong nav dropdown.`);
    }
  }

  // 2. Aliases must NOT pollute the canonical 28 (Rule 05 tab count).
  const groupsBlock = src[TABS_CONFIG].slice(
    src[TABS_CONFIG].indexOf("export const SAFETY_GROUPS"),
    src[TABS_CONFIG].indexOf("export const TABS")
  );
  for (const { id } of STATIC_ORPHAN_ROUTES) {
    if (new RegExp(`id:\\s*"${id}"`).test(groupsBlock)) {
      problems.push(`${TABS_CONFIG}: ${id} leaked into SAFETY_GROUPS — would break canonical 28 count.`);
    }
  }

  // 3. SafetyGroupNav must merge aliases into rendered dropdowns.
  if (!src[GROUP_NAV].includes("SAFETY_ALIAS_TABS")) {
    problems.push(`${GROUP_NAV}: does not merge SAFETY_ALIAS_TABS — alias tabs registered but never shown.`);
  }

  // 4. SafetyLayout must resolve alias routes to activeTabId (breadcrumb correctness).
  if (!src[LAYOUT].includes("SAFETY_ALIAS_TABS")) {
    problems.push(`${LAYOUT}: activeTabId derivation ignores SAFETY_ALIAS_TABS — alias pages highlight wrong tab.`);
  }

  // 5. Safety Home quick-jump grid must expose alias entry points (secondary reachability).
  if (!src[HOME_TAB].includes("SAFETY_ALIAS_TABS")) {
    problems.push(`${HOME_TAB}: does not render SAFETY_ALIAS_TABS quick-jumps — Home has no path to orphan surfaces.`);
  }

  // 6. Parameterized driver Safety Profile linked from driver reverse section.
  if (!DRIVER_PROFILE_ROUTE_PATTERN.test(src[DRIVER_SECTION])) {
    problems.push(`${DRIVER_SECTION}: no link to /safety/driver-profiles/:driverId — per-driver route has no inbound entry.`);
  }

  // 7. Routes remain mounted in manifest (additive-only — never delete). Read raw — JSX comments
  // like `/safety/*` contain `*/` sequences that break naive block-comment stripping.
  const manifestRaw = sources?.[MANIFEST] ?? read(MANIFEST);
  for (const { route } of STATIC_ORPHAN_ROUTES) {
    if (!manifestRaw.includes(route)) {
      problems.push(`${MANIFEST}: ${route} not mounted — surface deleted instead of linked (Rule 07 violation).`);
    }
  }
  if (!manifestRaw.includes("/safety/driver-profiles/:driverId")) {
    problems.push(`${MANIFEST}: /safety/driver-profiles/:driverId not mounted.`);
  }

  return problems;
}

if (SELFTEST) {
  const live = Object.fromEntries(FILES.map((rel) => [rel, read(rel)]));
  const failures = [];

  const expectCaught = (name, mutated, needle) => {
    if (JSON.stringify(mutated) === JSON.stringify(live)) {
      failures.push(`${name}: inert mutation`);
      return;
    }
    const problems = assertSafetyF22OrphanNavReachability(mutated);
    if (!problems.some((p) => p.includes(needle))) {
      failures.push(`${name}: NOT caught (expected "${needle}", got: ${problems.join(" | ") || "none"})`);
    }
  };

  expectCaught(
    "alias-route-removed",
    { ...live, [TABS_CONFIG]: live[TABS_CONFIG].replace('route: "/safety/audit-425c"', 'route: "/safety/gone"') },
    "/safety/audit-425c"
  );
  expectCaught(
    "nav-stops-merging-aliases",
    { ...live, [GROUP_NAV]: live[GROUP_NAV].replace(/SAFETY_ALIAS_TABS/g, "OTHER_TABS") },
    "does not merge SAFETY_ALIAS_TABS"
  );
  expectCaught(
    "home-missing-alias-quick-jumps",
    { ...live, [HOME_TAB]: live[HOME_TAB].replace(/SAFETY_ALIAS_TABS/g, "OTHER_ALIAS_TABS") },
    "does not render SAFETY_ALIAS_TABS quick-jumps"
  );
  expectCaught(
    "driver-profile-link-removed",
    { ...live, [DRIVER_SECTION]: live[DRIVER_SECTION].replace(DRIVER_PROFILE_ROUTE_PATTERN, "/safety/home") },
    "no link to /safety/driver-profiles/:driverId"
  );

  const liveProblems = assertSafetyF22OrphanNavReachability(live);
  if (liveProblems.length) failures.push(`live sources FAIL: ${liveProblems.join(" | ")}`);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — 4 planted defects caught, live sources clean`);
  process.exit(0);
}

const problems = assertSafetyF22OrphanNavReachability();
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — 6 alias routes + driver Safety Profile + Home quick-jumps reachable (SAF-F22)`);
