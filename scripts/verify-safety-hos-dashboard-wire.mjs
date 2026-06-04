#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.env.VERIFY_SAFETY_HOS_DASHBOARD_ROOT ?? process.cwd();

const paths = {
  hosPage: path.join(ROOT, "apps/frontend/src/pages/safety/HoursOfServicePage.tsx"),
  hosTab: path.join(ROOT, "apps/frontend/src/pages/safety/tabs/HoursOfServiceTab.tsx"),
  orphanExceptions: path.join(ROOT, "apps/frontend/src/pages/safety/hos/HosExceptionsPage.tsx"),
  tabsConfig: path.join(ROOT, "apps/frontend/src/components/safety/SAFETY_TABS_CONFIG.ts"),
  manifest: path.join(ROOT, "apps/frontend/src/routes/manifest.tsx"),
  tests: path.join(ROOT, "apps/frontend/src/pages/safety/__tests__/HoursOfServiceDashboard.test.tsx"),
};

function read(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
}

function main() {
  const failures = [];
  const hosPage = read(paths.hosPage);
  const hosTab = read(paths.hosTab);
  const orphanExceptions = read(paths.orphanExceptions);
  const tabsConfig = read(paths.tabsConfig);
  const manifest = read(paths.manifest);
  const tests = read(paths.tests);

  if (!hosPage.includes("export function HoursOfServicePage")) {
    failures.push("HoursOfServicePage.tsx missing canonical export");
  }
  if (!hosPage.includes('data-testid="safety-hos-dashboard-page"')) {
    failures.push("HoursOfServicePage.tsx missing safety-hos-dashboard-page test id");
  }
  if (!hosPage.includes("getDriverHosDetail") || !hosPage.includes("/safety/hos-violations")) {
    failures.push("HoursOfServicePage.tsx must read CAP-11 HOS detail and link violations tab");
  }
  if (!hosPage.includes("+ Create violation")) {
    failures.push("HoursOfServicePage.tsx must use + Create violation vocabulary");
  }
  if (hosPage.includes("+ New") || hosPage.includes("+ Add ")) {
    failures.push("HoursOfServicePage.tsx must not use non-canonical + New / + Add vocabulary");
  }

  if (!orphanExceptions.includes("ARCHIVE (A23-6)")) {
    failures.push("HosExceptionsPage.tsx must carry ARCHIVE (A23-6) header");
  }
  if (!orphanExceptions.includes('to="/safety/hos"')) {
    failures.push("HosExceptionsPage.tsx must link to canonical /safety/hos dashboard");
  }

  if (!tabsConfig.includes('id: "hos"') || !tabsConfig.match(/id:\s*"hos"[\s\S]*?status:\s*"Live"/)) {
    failures.push("SAFETY_TABS_CONFIG hos tab must be Live");
  }

  if (!manifest.includes('path="hos"') || !manifest.includes("<HoursOfServiceTab")) {
    failures.push("manifest must route hos to HoursOfServiceTab");
  }

  if (!hosTab.includes("HoursOfServicePage")) {
    failures.push("HoursOfServiceTab must render HoursOfServicePage");
  }

  const testCount = (tests.match(/\bit\(/g) ?? []).length;
  if (testCount < 3) {
    failures.push("HoursOfServiceDashboard.test.tsx must include at least 3 vitest cases");
  }

  if (failures.length > 0) {
    console.error("verify:safety-hos-dashboard-wire FAILED");
    for (const failure of failures) console.error(` - ${failure}`);
    process.exit(1);
  }

  console.log("verify:safety-hos-dashboard-wire OK");
}

main();
