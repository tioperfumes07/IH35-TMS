#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const configPath = path.join(ROOT, "apps/frontend/src/components/safety/SAFETY_TABS_CONFIG.ts");
const layoutPath = path.join(ROOT, "apps/frontend/src/pages/safety/SafetyLayout.tsx");
const testPath = path.join(ROOT, "apps/frontend/src/components/safety/__tests__/SafetyNavRouting.test.ts");

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function failuresFor({ config, layout, test }) {
  const failures = [];
  if (!config.includes('routeAliases: ["/safety/scheduler/requests"]')) {
    failures.push("Leave Requests must own the mounted /safety/scheduler/requests detail prefix");
  }
  if (!config.includes("export function findSafetyTabByPath(path: string)")) {
    failures.push("Safety route identity must have one shared path resolver");
  }
  if (!config.includes("...(tab.routeAliases ?? [])")) {
    failures.push("shared path resolver must include canonical tab route aliases");
  }
  if (!layout.includes("findSafetyTabByPath(path)?.tab.id")) {
    failures.push("SafetyLayout must consume the shared route identity resolver");
  }
  if (layout.includes('return "driver-files";') && layout.includes("const candidates:")) {
    failures.push("SafetyLayout must not retain its private route matcher/fallback implementation");
  }
  if (!test.includes('const detailPath = "/safety/scheduler/requests/')) {
    failures.push("route test must cover a real nested leave-request detail URL");
  }
  if (!test.includes('expect(match?.group.label).toBe("Workforce Planning")')) {
    failures.push("route test must ratchet the correct Workforce Planning group identity");
  }
  return failures;
}

const sources = {
  config: read(configPath),
  layout: read(layoutPath),
  test: read(testPath),
};

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["drop detail alias", (s) => ({ ...s, config: s.config.replace('routeAliases: ["/safety/scheduler/requests"]', "") })],
    ["drop shared resolver", (s) => ({ ...s, config: s.config.replace("export function findSafetyTabByPath(path: string)", "function removedSafetyTabByPath(path: string)") })],
    ["drop alias participation", (s) => ({ ...s, config: s.config.replace("...(tab.routeAliases ?? [])", "") })],
    ["detach layout", (s) => ({ ...s, layout: s.layout.replace("findSafetyTabByPath(path)?.tab.id", 'findSafetyTab("driver-files")?.tab.id') })],
    ["drop nested-route test", (s) => ({ ...s, test: s.test.replace('const detailPath = "/safety/scheduler/requests/', 'const detailPath = "/safety/not-the-mounted-route/') })],
    ["weaken group assertion", (s) => ({ ...s, test: s.test.replace('expect(match?.group.label).toBe("Workforce Planning")', 'expect(match?.group.label).toBe("Driver Files & Training")') })],
  ];
  let passed = 0;
  for (const [name, mutate] of mutations) {
    if (failuresFor(mutate(sources)).length > 0) passed += 1;
    else console.error(`mutation survived: ${name}`);
  }
  if (passed !== mutations.length) process.exit(1);
  console.log(`verify-safety-leave-request-route-identity selftest: ${passed}/${mutations.length} mutations rejected`);
  process.exit(0);
}

const failures = failuresFor(sources);
if (failures.length > 0) {
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}
console.log("verify-safety-leave-request-route-identity: PASS");
