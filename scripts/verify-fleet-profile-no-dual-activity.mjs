#!/usr/bin/env node
/**
 * verify-fleet-profile-no-dual-activity.mjs  (DUALPATH-06 / DUALPATH-07, 2026-07-22)
 *
 * Fix for the live DUAL_PATH_OLD_ACTIVE finding in
 * docs/trackers/DUAL-PATH-OLD-VS-NEW-DESIGN-AUDIT-2026-07-22.md (#1 items 6-7):
 * `VehicleProfilePage` and `TrailerProfilePage` used to render BOTH the deprecated raw-JSON
 * "Recent activity" widgets (`RecentActivitySection`, `TrailerRecentActivitySection`) AND the
 * canonical `ServiceTimeline` on the same screen — a live, operator-visible dual path.
 *
 * This guard proves:
 *   1. Neither profile page imports/renders the archived widgets anymore.
 *   2. Both archived widget files remain present with an `@archived` annotation
 *      (Rule 07: archive-not-delete — never delete the module, only stop rendering it).
 *   3. Both profile pages still render `ServiceTimeline` as the sole live activity surface.
 *
 * Usage:
 *   node scripts/verify-fleet-profile-no-dual-activity.mjs
 *   node scripts/verify-fleet-profile-no-dual-activity.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();

const PAIRS = [
  {
    label: "VehicleProfilePage / RecentActivitySection (DUALPATH-06)",
    pagePath: "apps/frontend/src/pages/fleet/VehicleProfilePage.tsx",
    archivedPath: "apps/frontend/src/components/vehicle-profile/RecentActivitySection.tsx",
    archivedComponentName: "RecentActivitySection",
    archiveMarker: "@archived — Fleet Vehicle Profile active-path",
  },
  {
    label: "TrailerProfilePage / TrailerRecentActivitySection (DUALPATH-07)",
    pagePath: "apps/frontend/src/pages/fleet/TrailerProfilePage.tsx",
    archivedPath: "apps/frontend/src/components/trailer-profile/TrailerRecentActivitySection.tsx",
    archivedComponentName: "TrailerRecentActivitySection",
    archiveMarker: "@archived — Fleet Trailer Profile active-path",
  },
];

function importsArchivedComponent(pageSrc, componentName) {
  const importRe = /\bfrom\s*["']([^"']+)["']/g;
  let m;
  while ((m = importRe.exec(pageSrc)) !== null) {
    const spec = m[1];
    if (new RegExp(`(^|/)${componentName}(\\.tsx)?$`).test(spec)) return true;
  }
  // Belt-and-suspenders: also catch a direct JSX render even without a matching import line
  // (e.g. re-export indirection) — the component name must not appear as a JSX tag.
  return new RegExp(`<${componentName}[\\s/>]`).test(pageSrc);
}

export function run() {
  const failures = [];

  for (const pair of PAIRS) {
    const pageFull = path.join(repoRoot, pair.pagePath);
    const archivedFull = path.join(repoRoot, pair.archivedPath);

    if (!fs.existsSync(pageFull)) {
      failures.push(`${pair.pagePath} — MISSING`);
      continue;
    }
    if (!fs.existsSync(archivedFull)) {
      failures.push(`${pair.archivedPath} — MISSING (do not delete; mark @archived instead — Rule 07)`);
      continue;
    }

    const pageSrc = fs.readFileSync(pageFull, "utf8");
    const archivedSrc = fs.readFileSync(archivedFull, "utf8");

    if (importsArchivedComponent(pageSrc, pair.archivedComponentName)) {
      failures.push(
        `${pair.label}: ${pair.pagePath} must not import/render ${pair.archivedComponentName} — ` +
          `ServiceTimeline is the sole canonical activity surface`
      );
    }

    if (!archivedSrc.includes(pair.archiveMarker)) {
      failures.push(`${pair.archivedPath} — missing "${pair.archiveMarker}" annotation`);
    }

    if (!pageSrc.includes("ServiceTimeline")) {
      failures.push(`${pair.label}: ${pair.pagePath} must render ServiceTimeline as the canonical activity surface`);
    }
  }

  if (failures.length) {
    console.error("[verify-fleet-profile-no-dual-activity] FAIL:");
    for (const message of failures) console.error(`  - ${message}`);
    return { ok: false, failures };
  }

  console.log(
    "[verify-fleet-profile-no-dual-activity] OK — both fleet profile pages render ServiceTimeline only; " +
      "archived widgets present+@archived, not imported/rendered live"
  );
  return { ok: true, failures: [] };
}

function selftest() {
  const badImport = `import { RecentActivitySection } from "../../components/vehicle-profile/RecentActivitySection";\n`;
  const badJsx = `<RecentActivitySection activity={x} />`;
  const okServiceTimelineOnly = `import { ServiceTimeline } from "../../components/maintenance/ServiceTimeline";\n<ServiceTimeline companyId={c} unitId={id} />`;

  if (!importsArchivedComponent(badImport, "RecentActivitySection")) {
    console.error("[verify-fleet-profile-no-dual-activity] SELFTEST FAIL — did not detect archived import");
    process.exit(1);
  }
  if (!importsArchivedComponent(badJsx, "RecentActivitySection")) {
    console.error("[verify-fleet-profile-no-dual-activity] SELFTEST FAIL — did not detect archived JSX render");
    process.exit(1);
  }
  if (importsArchivedComponent(okServiceTimelineOnly, "RecentActivitySection")) {
    console.error("[verify-fleet-profile-no-dual-activity] SELFTEST FAIL — false positive on ServiceTimeline-only page");
    process.exit(1);
  }
  console.log(
    "[verify-fleet-profile-no-dual-activity] SELFTEST PASS — detects archived import/JSX remount; " +
      "ignores ServiceTimeline-only pages"
  );
}

const isMain = path.resolve(process.argv[1] ?? "") === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  if (process.argv.includes("--selftest")) selftest();
  else process.exit(run().ok ? 0 : 1);
}
