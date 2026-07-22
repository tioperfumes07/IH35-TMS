#!/usr/bin/env node
/**
 * verify-drivers-active-path.mjs
 *
 * Active-path law for Drivers (owner class: DUAL_PATH_OLD_ACTIVE / ORPHAN_NEW):
 *   New CLOSURE / A17.2 surfaces must win; parallel chrome and deprecated singular
 *   reference catalogs must not stay Live while the canonical path exists.
 *
 * Proves:
 *   1. Manifest lazy-mounts pages/Drivers.tsx (canonical), not a second chrome.
 *   2. pages/drivers/DriversPage.tsx stays present with @archived marker (Rule 07).
 *   3. /drivers/auto-deductions Navigate → /drivers/deductions (duplicate panel).
 *   4. Team Splits + Disputes render inside Drivers.tsx unified subnav.
 *   5. Singular /lists/driver/{5 reference catalogs} Navigate → /lists/drivers/*.
 *   6. Plural /lists/drivers/* catalogs remain mounted Live.
 *   7. deprecated-subcatalog-pages.tsx stays @archived and unmounted.
 *
 * Usage:
 *   node scripts/verify-drivers-active-path.mjs
 *   node scripts/verify-drivers-active-path.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-drivers-active-path";
const ROOT = process.cwd();

const PATHS = {
  manifest: "apps/frontend/src/routes/manifest.tsx",
  driversCanonical: "apps/frontend/src/pages/Drivers.tsx",
  driversWrapper: "apps/frontend/src/pages/drivers/DriversPage.tsx",
  deprecatedPages: "apps/frontend/src/pages/lists/driver/deprecated-subcatalog-pages.tsx",
  archDesign: "docs/specs/IH35_ARCHITECTURAL_DESIGN.md",
};

const ARCHIVE_MARKER = "@archived — Drivers active-path";

const REFERENCE_REDIRECTS = [
  { from: "/lists/driver/license-classes", to: "/lists/drivers/license-classes" },
  { from: "/lists/driver/endorsements", to: "/lists/drivers/endorsements" },
  { from: "/lists/driver/restrictions", to: "/lists/drivers/restrictions" },
  { from: "/lists/driver/medical-card-status", to: "/lists/drivers/medical-card-status" },
  { from: "/lists/driver/employment-status", to: "/lists/drivers/employment-status" },
];

const LIVE_PLURAL = [
  "/lists/drivers/license-classes",
  "/lists/drivers/endorsements",
  "/lists/drivers/restrictions",
  "/lists/drivers/medical-card-status",
  "/lists/drivers/employment-status",
];

function read(rel) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full, "utf8");
}

function assertNavigate(manifest, fromPath, toPath) {
  const escapedFrom = fromPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedTo = toPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pathPat = new RegExp(
    `path=["']${escapedFrom}["'][\\s\\S]{0,220}?Navigate[^>]*to=["']${escapedTo}["']`,
    "m"
  );
  if (!pathPat.test(manifest)) {
    return `manifest missing Navigate ${fromPath} → ${toPath}`;
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

  const { manifest, driversCanonical, driversWrapper, deprecatedPages, archDesign } = files;

  // 1. Canonical LIVE mount
  if (!/React\.lazy\(\(\)\s*=>\s*import\(["']\.\.\/pages\/Drivers["']\)/.test(manifest)) {
    failures.push("manifest must lazy-import ../pages/Drivers (canonical LIVE mount)");
  }
  if (/React\.lazy\(\(\)\s*=>\s*import\(["']\.\.\/pages\/drivers\/DriversPage["']\)/.test(manifest)) {
    failures.push("manifest must not lazy-import pages/drivers/DriversPage as Live mount (archived wrapper)");
  }
  if (!driversCanonical.includes("data-testid=\"drivers-unified-subnav\"")) {
    failures.push("Drivers.tsx must render unified subnav (data-testid=drivers-unified-subnav)");
  }
  if (!driversCanonical.includes("drivers-team-splits-tab") || !driversCanonical.includes("drivers-disputes-tab")) {
    failures.push("Drivers.tsx must expose Team Splits + Disputes tabs in the unified chrome");
  }
  if (!driversCanonical.includes("TeamSplitConfigPanel") || !driversCanonical.includes("SettlementDisputeList")) {
    failures.push("Drivers.tsx must render TeamSplitConfigPanel and SettlementDisputeList");
  }
  if (!driversCanonical.includes("openCount")) {
    failures.push("Drivers.tsx Disputes tab must use openCount badge");
  }

  // 2. Archived wrapper present
  if (!driversWrapper.includes(ARCHIVE_MARKER)) {
    failures.push(`${PATHS.driversWrapper} missing ${ARCHIVE_MARKER}`);
  }
  if (!driversWrapper.includes("export { DriversPage } from \"../Drivers\"")) {
    failures.push("DriversPage.tsx must re-export DriversPage from ../Drivers");
  }

  // 3. auto-deductions redirect (must be Navigate, not DriversSubtabRoute)
  const autoErr = assertNavigate(manifest, "/drivers/auto-deductions", "/drivers/deductions");
  if (autoErr) failures.push(autoErr);
  {
    const autoBlock = manifest.match(
      /path=["']\/drivers\/auto-deductions["'][\s\S]{0,280}?(?=path=["']\/drivers\/)/
    )?.[0] ?? "";
    if (autoBlock.includes("DriversSubtabRoute")) {
      failures.push("/drivers/auto-deductions must not mount DriversSubtabRoute (duplicate of deductions)");
    }
    if (!autoBlock.includes("Navigate")) {
      failures.push("/drivers/auto-deductions route block must use Navigate");
    }
  }

  // 4–5. Lists reference redirects + Live plural
  for (const { from, to } of REFERENCE_REDIRECTS) {
    const err = assertNavigate(manifest, from, to);
    if (err) failures.push(err);
  }
  for (const route of LIVE_PLURAL) {
    if (!manifest.includes(`path="${route}"`) && !manifest.includes(`path='${route}'`)) {
      failures.push(`manifest missing Live plural route ${route}`);
    }
  }

  // 6. Deprecated pages archived + unmounted
  if (!deprecatedPages.includes(ARCHIVE_MARKER) && !deprecatedPages.includes("@archived — Drivers active-path")) {
    failures.push(`${PATHS.deprecatedPages} missing ${ARCHIVE_MARKER}`);
  }
  for (const name of [
    "LicenseClassesListPage",
    "CdlEndorsementsListPage",
    "CdlRestrictionsListPage",
    "MedicalCardStatusesListPage",
    "EmploymentStatusesListPage",
  ]) {
    if (new RegExp(`<${name}\\b`).test(manifest)) {
      failures.push(`manifest must not mount archived ${name}`);
    }
  }
  if (/from\s+["'][^"']*deprecated-subcatalog-pages["']/.test(manifest)) {
    failures.push("manifest must not import deprecated-subcatalog-pages (redirect instead)");
  }

  // 7. Arch design documents the law
  if (!archDesign.includes("verify:drivers-active-path")) {
    failures.push("IH35_ARCHITECTURAL_DESIGN.md must reference verify:drivers-active-path");
  }
  if (!archDesign.includes("Active-path law")) {
    failures.push("IH35_ARCHITECTURAL_DESIGN.md must document Drivers Active-path law");
  }
  if (!archDesign.includes("9 query-synced subtabs")) {
    failures.push("ARCHITECTURAL_DESIGN must keep locked 9 query-synced subtabs");
  }

  return failures;
}

function selftest() {
  const goodManifest = `
    const DriversPage = React.lazy(() => import("../pages/Drivers").then((m) => ({ default: m.DriversPage })));
    <Route path="/drivers/auto-deductions" element={<Navigate to="/drivers/deductions" replace />} />
    <Route path="/lists/driver/license-classes" element={<Navigate to="/lists/drivers/license-classes" replace />} />
    <Route path="/lists/driver/endorsements" element={<Navigate to="/lists/drivers/endorsements" replace />} />
    <Route path="/lists/driver/restrictions" element={<Navigate to="/lists/drivers/restrictions" replace />} />
    <Route path="/lists/driver/medical-card-status" element={<Navigate to="/lists/drivers/medical-card-status" replace />} />
    <Route path="/lists/driver/employment-status" element={<Navigate to="/lists/drivers/employment-status" replace />} />
    path="/lists/drivers/license-classes"
    path="/lists/drivers/endorsements"
    path="/lists/drivers/restrictions"
    path="/lists/drivers/medical-card-status"
    path="/lists/drivers/employment-status"
  `;
  const badManifest = goodManifest.replace(
    'import("../pages/Drivers")',
    'import("../pages/drivers/DriversPage")'
  );

  if (!/React\.lazy\(\(\)\s*=>\s*import\(["']\.\.\/pages\/Drivers["']\)/.test(goodManifest)) {
    console.error(`${LABEL} SELFTEST FAILED — good lazy import not recognized`);
    process.exit(1);
  }
  if (!/React\.lazy\(\(\)\s*=>\s*import\(["']\.\.\/pages\/drivers\/DriversPage["']\)/.test(badManifest)) {
    console.error(`${LABEL} SELFTEST FAILED — bad lazy import not recognized`);
    process.exit(1);
  }
  const navOk = assertNavigate(goodManifest, "/drivers/auto-deductions", "/drivers/deductions");
  if (navOk) {
    console.error(`${LABEL} SELFTEST FAILED — Navigate helper: ${navOk}`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const failures = runChecks();
if (failures.length) {
  console.error(`${LABEL}: FAIL`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  `${LABEL}: PASS — Drivers canonical mount + auto-deductions/list redirects + archived parallel trees`
);
process.exit(0);
