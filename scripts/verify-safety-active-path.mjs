#!/usr/bin/env node
/**
 * verify-safety-active-path.mjs
 *
 * Active-path law for Safety (owner class: dual-path / stale-active):
 *   New V6.4 code exists; the App must mount THAT path — not ComingSoon stubs,
 *   not the archived v5 flat shell, not pre-V64 orphan pages.
 *
 * Proves:
 *   1. /safety uses SafetyLayout + SafetyGroupNav + SAFETY_TABS_CONFIG.
 *   2. Every SAFETY_GROUPS route is registered in manifest.tsx.
 *   3. Group bookmark aliases Navigate to Live tabs (never ComingSoonPage).
 *   4. Archived shells (SafetyHome, DotInspectionsPage, ComplaintsPage) stay
 *      present with @archived markers and are NOT mounted as route elements.
 *   5. Live tab wrappers (DOTInspectionsTab, ComplaintsTab) ARE the mounted path.
 *
 * Usage:
 *   node scripts/verify-safety-active-path.mjs
 *   node scripts/verify-safety-active-path.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-safety-active-path";
const ROOT = process.cwd();

const PATHS = {
  manifest: "apps/frontend/src/routes/manifest.tsx",
  layout: "apps/frontend/src/pages/safety/SafetyLayout.tsx",
  tabsConfig: "apps/frontend/src/components/safety/SAFETY_TABS_CONFIG.ts",
  groupNav: "apps/frontend/src/components/safety/SafetyGroupNav.tsx",
  safetyHome: "apps/frontend/src/pages/safety/SafetyHome.tsx",
  dotPage: "apps/frontend/src/pages/safety/DotInspectionsPage.tsx",
  complaintsPage: "apps/frontend/src/pages/safety/ComplaintsPage.tsx",
  tabsIndex: "apps/frontend/src/pages/safety/tabs/index.ts",
  sidebar: "apps/frontend/src/components/layout/sidebar-config.ts",
};

const ARCHIVE_MARKER = "@archived — Safety active-path (V6.4)";

/** Group bookmarks that must redirect to a Live tab (not ComingSoon). */
const GROUP_ALIAS_REDIRECTS = [
  { path: "/safety/fines-and-discipline", to: "/safety/internal-fines" },
  { path: "/safety/driver-financial-safety", to: "/safety/escrow-record" },
  { path: "/safety/workforce-planning", to: "/safety/driver-scheduler" },
  { path: "/safety/hours-of-service", to: "/safety/hos" },
  { path: "/safety/inspections", to: "/safety/dot-inspections" },
];

function read(rel) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full, "utf8");
}

function fail(msg) {
  console.error(`${LABEL} FAIL: ${msg}`);
  process.exit(1);
}

function extractGroupRoutes(tabsConfigSrc) {
  // RE-ANCHOR (found stale 2026-08-29): this scanned the WHOLE file, not just SAFETY_GROUPS (the
  // check's own stated purpose, line 11 above) -- it also picked up SAFETY_ALIAS_TABS entries,
  // including ones whose route is a deliberately-parameterized prefix with no bare-path manifest
  // registration (e.g. driver-safety-profile's navHidden "/safety/driver-profiles", real mount is
  // "driver-profiles/:driverId"). Scoped to the SAFETY_GROUPS array literal only, matching the
  // function's documented intent; alias-tab routes were never meant to be asserted here.
  const groupsOnly = tabsConfigSrc.slice(
    tabsConfigSrc.indexOf("export const SAFETY_GROUPS"),
    tabsConfigSrc.indexOf("export const SAFETY_ALIAS_TABS"),
  );
  const routes = [];
  const re = /route:\s*"(\/safety\/[^"]+)"/g;
  let m;
  while ((m = re.exec(groupsOnly)) !== null) {
    routes.push(m[1]);
  }
  return [...new Set(routes)];
}

/** Escape all RegExp metacharacters (incl. `\`) — CodeQL js/incomplete-sanitization. */
function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assertNavigateAlias(manifest, fromPath, toPath) {
  // Accept either absolute or relative child path forms in Route path=
  const escapedFrom = escapeRegExp(fromPath);
  const absOrRel = escapeRegExp(fromPath.replace(/^\/safety\//, ""));
  const escapedTo = escapeRegExp(toPath);
  const pathPat = new RegExp(
    `path=["'](?:${escapedFrom}|${absOrRel})["'][\\s\\S]{0,200}?Navigate[^>]*to=["']${escapedTo}["']`,
    "m"
  );
  if (!pathPat.test(manifest)) {
    return `manifest missing Navigate ${fromPath} → ${toPath}`;
  }
  // Must not still render ComingSoon for this path
  const comingSoonPat = new RegExp(
    `path=["'](?:${escapedFrom}|${absOrRel})["'][\\s\\S]{0,160}?ComingSoonPage`,
    "m"
  );
  if (comingSoonPat.test(manifest)) {
    return `${fromPath} still mounts ComingSoonPage (stale-active)`;
  }
  return null;
}

function runChecks() {
  const failures = [];
  const files = {};
  for (const [key, rel] of Object.entries(PATHS)) {
    const src = read(rel);
    if (src == null) {
      failures.push(`missing required file: ${rel}`);
      continue;
    }
    files[key] = src;
  }
  if (failures.length) return failures;

  const { manifest, layout, tabsConfig, groupNav, safetyHome, dotPage, complaintsPage, tabsIndex, sidebar } =
    files;

  // 1. Live shell
  if (!manifest.includes('path="/safety"') || !manifest.includes("<SafetyLayout")) {
    failures.push("manifest must mount SafetyLayout at /safety");
  }
  if (!layout.includes("SafetyGroupNav") || !layout.includes("SAFETY_GROUPS")) {
    failures.push("SafetyLayout must render SafetyGroupNav from SAFETY_GROUPS");
  }
  if (!groupNav.includes("HoverDropdown") || !groupNav.includes("SAFETY_ALIAS_TABS")) {
    failures.push("SafetyGroupNav must be the V6.4 hover-dropdown shell");
  }
  if (!tabsConfig.includes("SAFETY_CANONICAL_TAB_COUNT = 28")) {
    failures.push("SAFETY_TABS_CONFIG must keep SAFETY_CANONICAL_TAB_COUNT = 28");
  }

  // 2. Every group route registered
  const routes = extractGroupRoutes(tabsConfig);
  if (routes.length < 28) {
    failures.push(`expected ≥28 SAFETY_GROUPS routes, found ${routes.length}`);
  }
  for (const route of routes) {
    const leaf = route.replace(/^\/safety\//, "");
    const hasAbs = manifest.includes(`path="${route}"`) || manifest.includes(`path='${route}'`);
    const hasRel =
      manifest.includes(`path="${leaf}"`) ||
      manifest.includes(`path='${leaf}'`) ||
      // nested: path="scheduler/pending-requests"
      (leaf.includes("/") &&
        (manifest.includes(`path="${leaf}"`) || manifest.includes(`path='${leaf}'`)));
    if (!hasAbs && !hasRel) {
      failures.push(`manifest missing route registration for ${route}`);
    }
  }

  // 3. Group aliases → Live tabs (never ComingSoon)
  for (const { path: fromPath, to } of GROUP_ALIAS_REDIRECTS) {
    const err = assertNavigateAlias(manifest, fromPath, to);
    if (err) failures.push(err);
  }

  // 4. Archived shells present + marked + unmounted
  for (const [rel, src, base] of [
    [PATHS.safetyHome, safetyHome, "SafetyHomePage"],
    [PATHS.dotPage, dotPage, "DotInspectionsPage"],
    [PATHS.complaintsPage, complaintsPage, "ComplaintsPage"],
  ]) {
    if (!src.includes(ARCHIVE_MARKER) && !(rel === PATHS.safetyHome && src.includes("@archived — Safety active-path"))) {
      // SafetyHome uses slightly longer header; accept either exact marker or @archived — Safety active-path
      if (!src.includes("@archived — Safety active-path")) {
        failures.push(`${rel} missing ${ARCHIVE_MARKER}`);
      }
    }
    // Not mounted as a route element / lazy import of the archived page basename
    const lazyMount = new RegExp(`React\\.lazy\\([\\s\\S]*?${base}[\\s\\S]*?\\)`);
    const elementMount = new RegExp(`<${base}\\b`);
    if (lazyMount.test(manifest) || elementMount.test(manifest)) {
      failures.push(`${rel} must not be mounted in manifest (use V6.4 tab wrappers)`);
    }
  }

  // SafetyHome.tsx must not be imported by manifest
  if (/from\s+["'][^"']*pages\/safety\/SafetyHome["']/.test(manifest)) {
    failures.push("manifest must not import pages/safety/SafetyHome (archived v5 shell)");
  }

  // 5. Live wrappers exported + used
  if (!tabsIndex.includes("DOTInspectionsTab") || !tabsIndex.includes("ComplaintsTab")) {
    failures.push("tabs/index.ts must export DOTInspectionsTab and ComplaintsTab");
  }
  if (!manifest.includes("<DOTInspectionsTab") || !manifest.includes("<ComplaintsTab")) {
    failures.push("manifest must mount DOTInspectionsTab and ComplaintsTab");
  }
  if (!manifest.includes("<SafetyHomeTab")) {
    failures.push("manifest must mount SafetyHomeTab at /safety/home (S-11)");
  }

  // Sidebar flyout: must include at least one V6.4 canonical route beyond the thin set
  if (!sidebar.includes('to: "/safety/home"') && !sidebar.includes('to: "/safety/csa-score"')) {
    failures.push("sidebar Safety flyout must include V6.4 canonical entry points (/safety/home or /safety/csa-score)");
  }
  if (!sidebar.includes('to: "/safety/dot-compliance"')) {
    failures.push("sidebar Safety flyout must keep /safety/dot-compliance (count-nav integrity)");
  }

  return failures;
}

function selftest() {
  // Planted: ComingSoon on a group alias must be detected by the regex helpers.
  const bad = `
    <Route path="/safety/fines-and-discipline" element={<ComingSoonPage feature="Fines & Discipline" />} />
  `;
  const err = assertNavigateAlias(bad, "/safety/fines-and-discipline", "/safety/internal-fines");
  if (!err) {
    fail("selftest: expected ComingSoon alias to fail assertNavigateAlias");
  }
  const good = `
    <Route path="/safety/fines-and-discipline" element={<Navigate to="/safety/internal-fines" replace />} />
  `;
  const ok = assertNavigateAlias(good, "/safety/fines-and-discipline", "/safety/internal-fines");
  if (ok) {
    fail(`selftest: expected good Navigate alias to pass, got: ${ok}`);
  }
  console.log(`${LABEL} selftest OK`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const failures = runChecks();
  if (failures.length) {
    console.error(`${LABEL} FAILED (${failures.length})`);
    for (const f of failures) console.error(` - ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — V6.4 SafetyLayout is the only active Safety mount`);
}

main();
