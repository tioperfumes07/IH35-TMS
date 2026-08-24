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

export function collectFailures({ hosPage, hosTab, orphanExceptions, tabsConfig, manifest, tests }) {
  const failures = [];
  if (!hosPage.includes("export function HoursOfServicePage")) {
    failures.push("HoursOfServicePage.tsx missing canonical export");
  }
  if (!hosPage.includes('data-testid="safety-hos-dashboard-page"')) {
    failures.push("HoursOfServicePage.tsx missing safety-hos-dashboard-page test id");
  }
  if (!hosPage.includes("getDriverHosDetail") || !hosPage.includes("/safety/hos-violations")) {
    failures.push("HoursOfServicePage.tsx must read CAP-11 HOS detail and link violations tab");
  }
  if (
    !/data-testid="safety-hos-create-violation"[\s\S]{0,400}>\s*\+\s*Create\s*</.test(hosPage) ||
    !/aria-label="Create HOS violation"/.test(hosPage)
  ) {
    failures.push(
      "HoursOfServicePage.tsx must expose modal create as + Create button with aria-label Create HOS violation",
    );
  }
  if (/>\s*\+\s*Create violation\s*</i.test(hosPage)) {
    failures.push("HoursOfServicePage.tsx primary CTA must be + Create (repo button law), not + Create violation");
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

  return failures;
}

function main() {
  const sources = {
    hosPage: read(paths.hosPage),
    hosTab: read(paths.hosTab),
    orphanExceptions: read(paths.orphanExceptions),
    tabsConfig: read(paths.tabsConfig),
    manifest: read(paths.manifest),
    tests: read(paths.tests),
  };
  if (process.argv.includes("--selftest")) {
    const good = {
      hosPage: `export function HoursOfServicePage() { getDriverHosDetail(); return <><a href="/safety/hos-violations" /><button data-testid="safety-hos-create-violation" aria-label="Create HOS violation">+ Create</button><div data-testid="safety-hos-dashboard-page" /></>; }`,
      hosTab: "<HoursOfServicePage />",
      orphanExceptions: 'ARCHIVE (A23-6) <Link to="/safety/hos" />',
      tabsConfig: 'id: "hos", label: "HOS", status: "Live"',
      manifest: '<Route path="hos" element={<HoursOfServiceTab />} />',
      tests: 'it("one", () => {}); it("two", () => {}); it("three", () => {});',
    };
    if (collectFailures(good).length) throw new Error(`good fixture rejected: ${collectFailures(good).join("; ")}`);
    const mutations = [
      ["hosPage", "export function HoursOfServicePage", "function LegacyHos", "missing canonical export"],
      ["hosPage", "safety-hos-dashboard-page", "removed-dashboard", "missing safety-hos-dashboard-page"],
      ["hosPage", "getDriverHosDetail", "getWrongDetail", "must read CAP-11"],
      ["hosPage", "/safety/hos-violations", "/wrong", "must read CAP-11"],
      ["hosPage", "safety-hos-create-violation", "removed-create", "must expose modal create"],
      ["hosPage", 'aria-label="Create HOS violation"', 'aria-label="Wrong"', "must expose modal create"],
      ["hosPage", ">+ Create<", ">+ Create violation<", "primary CTA must be + Create"],
      ["hosPage", ">+ Create<", ">+ New<", "must not use non-canonical"],
      ["orphanExceptions", "ARCHIVE (A23-6)", "ACTIVE", "must carry ARCHIVE"],
      ["orphanExceptions", 'to="/safety/hos"', 'to="/wrong"', "must link to canonical"],
      ["tabsConfig", 'id: "hos"', 'id: "wrong"', "hos tab must be Live"],
      ["tabsConfig", 'status: "Live"', 'status: "Hidden"', "hos tab must be Live"],
      ["manifest", 'path="hos"', 'path="wrong"', "manifest must route"],
      ["manifest", "<HoursOfServiceTab", "<LegacyHosTab", "manifest must route"],
      ["hosTab", "HoursOfServicePage", "LegacyHos", "must render HoursOfServicePage"],
      ["tests", 'it("three", () => {});', "", "at least 3 vitest cases"],
    ];
    for (const [field, from, to, expected] of mutations) {
      const failures = collectFailures({ ...good, [field]: good[field].replace(from, to) });
      if (!failures.some((failure) => failure.includes(expected))) {
        throw new Error(`mutation escaped: ${expected} (${JSON.stringify(failures)})`);
      }
    }
    console.log(`verify:safety-hos-dashboard-wire SELFTEST OK ${mutations.length}/${mutations.length}`);
    return;
  }
  const failures = collectFailures(sources);
  if (failures.length > 0) {
    console.error("verify:safety-hos-dashboard-wire FAILED");
    for (const failure of failures) console.error(` - ${failure}`);
    process.exit(1);
  }

  console.log("verify:safety-hos-dashboard-wire OK");
}

main();
