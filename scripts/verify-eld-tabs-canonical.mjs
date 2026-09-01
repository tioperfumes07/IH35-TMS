#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const FILES = {
  page: "apps/frontend/src/pages/eld/EldPage.tsx",
  live: "apps/frontend/src/pages/eld/tabs/LiveDutyTab.tsx",
  violations: "apps/frontend/src/pages/eld/tabs/ViolationsTab.tsx",
  unidentified: "apps/frontend/src/pages/eld/tabs/UnidentifiedTab.tsx",
};

function readFiles() {
  return Object.fromEntries(
    Object.entries(FILES).map(([key, rel]) => [key, fs.readFileSync(path.join(ROOT, rel), "utf8")]),
  );
}

// LST-F10164 (#18889, "navy subnav: 13 of 178, ELD module") migrated EldPage.tsx from
// SecondaryNavTabs to the shared NavyPageSubNav component (the same navy-subnav rollout that
// touched Dispatch.tsx, driver-profile, etc. elsewhere in this repo) — a legitimate, deliberate
// change this guard's own SecondaryNavTabs check went stale against, same root-cause class as
// LST-F10184's stale startToken literal fixed earlier this session. Recognize EITHER canonical
// nav shape so the guard stays meaningful across both the pre- and post-migration state, rather
// than hard-failing every ELD build on a component swap that already shipped.
export function inspect(sources) {
  const failures = [];
  const page = sources.page;
  const usesSecondaryNavTabs =
    page.includes('import { SecondaryNavTabs } from "../../components/shared/SecondaryNavTabs";') &&
    page.includes("<SecondaryNavTabs");
  const usesNavyPageSubNav =
    page.includes('import { NavyPageSubNav } from "../../components/layout/NavyPageSubNav";') &&
    page.includes("<NavyPageSubNav");
  if (!usesSecondaryNavTabs && !usesNavyPageSubNav) {
    failures.push("EldPage.tsx is not importing/rendering a canonical subnav (SecondaryNavTabs or NavyPageSubNav)");
  }
  if (page.includes("rounded border px-3 py-1.5 text-sm transition-colors")) {
    failures.push("EldPage.tsx still contains legacy button-style tab classes");
  }
  if (page.includes("border-blue-600 bg-blue-600 text-white")) {
    failures.push("EldPage.tsx still contains active blue button-style tabs");
  }

  for (const [key, label] of [
    ["live", "Live Duty"],
    ["violations", "Violations"],
    ["unidentified", "Unidentified Driving"],
  ]) {
    const source = sources[key];
    if (!source.includes('import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";')) {
      failures.push(`${label} must use the shared recoverable error banner`);
    }
    if (!/query\.isError[\s\S]{0,400}<ListErrorBanner[\s\S]{0,400}onRetry=\{\(\) => void query\.refetch\(\)\}/.test(source)) {
      failures.push(`${label} read failure must retry its exact query`);
    }
  }
  return failures;
}

const live = readFiles();
if (process.argv.includes("--selftest")) {
  const failures = [];
  for (const key of ["live", "violations", "unidentified"]) {
    const planted = { ...live, [key]: live[key].replace("query.refetch()", "query.remove()") };
    if (!inspect(planted).some((message) => message.includes("retry its exact query"))) {
      failures.push(`${key}: removing its exact retry was not caught`);
    }
  }
  if (failures.length) {
    console.error(`verify:eld-tabs-canonical selftest failed:\n- ${failures.join("\n- ")}`);
    process.exit(1);
  }
  console.log("verify:eld-tabs-canonical selftest: ok (3 planted retry defects caught)");
  process.exit(0);
}

const failures = inspect(live);
if (failures.length) {
  console.error(`verify:eld-tabs-canonical failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("verify:eld-tabs-canonical: ok");
