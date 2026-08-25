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

export function inspect(sources) {
  const failures = [];
  const page = sources.page;
  if (!page.includes('import { SecondaryNavTabs } from "../../components/shared/SecondaryNavTabs";')) {
    failures.push("EldPage.tsx is not importing SecondaryNavTabs");
  }
  if (!page.includes("<SecondaryNavTabs")) failures.push("EldPage.tsx is not rendering SecondaryNavTabs");
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
