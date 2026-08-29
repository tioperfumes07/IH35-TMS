#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const paths = {
  config: path.join(ROOT, "apps/frontend/src/components/safety/SAFETY_TABS_CONFIG.ts"),
  layout: path.join(ROOT, "apps/frontend/src/pages/safety/SafetyLayout.tsx"),
  manifest: path.join(ROOT, "apps/frontend/src/routes/manifest.tsx"),
  test: path.join(ROOT, "apps/frontend/src/components/safety/__tests__/SafetyNavRouting.test.ts"),
};

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

const owed = [
  ["integrity-alerts", "Integrity Alerts", "compliance-monitoring"],
  ["csa-mitigation", "CSA Mitigation", "inspections-fmcsa"],
  ["csa-fmcsa-trend", "CSA / FMCSA Trend", "inspections-fmcsa"],
  ["anomaly-alerts", "Anomaly Alerts", "compliance-monitoring"],
  ["driver-profiles", "Driver Safety Profile", "driver-files"],
];

function failuresFor({ config, layout, manifest, test }) {
  const failures = [];
  for (const [route, label, groupId] of owed) {
    if (!manifest.includes(`path="${route}`)) failures.push(`manifest must mount ${route}`);
    if (!config.includes(`groupId: "${groupId}"`) || !config.includes(`label: "${label}", route: "/safety/${route}"`)) {
      failures.push(`${route} must have canonical ${groupId} / ${label} alias ownership`);
    }
    if (!test.includes(`"/safety/${route}`)) failures.push(`focused route census must cover ${route}`);
  }
  if (!layout.includes("findSafetyTabByPath(path)?.tab.id")) failures.push("SafetyLayout must use the shared canonical path resolver");
  if (!config.includes("candidates.sort((a, b) => b.route.length - a.route.length)")) failures.push("path resolver must preserve longest-prefix precedence");
  return failures;
}

const sources = Object.fromEntries(Object.entries(paths).map(([key, filePath]) => [key, read(filePath)]));

if (process.argv.includes("--selftest")) {
  const mutations = owed.map(([route, label]) => [
    `drop ${route}`,
    (source) => ({ ...source, config: source.config.replace(`label: "${label}", route: "/safety/${route}"`, `label: "${label}", route: "/safety/missing-${route}"`) }),
  ]);
  mutations.push([
    "detach shared resolver",
    (source) => ({ ...source, layout: source.layout.replace("findSafetyTabByPath(path)?.tab.id", 'findSafetyTab("driver-files")?.tab.id') }),
  ]);
  mutations.push([
    "drop longest prefix",
    (source) => ({ ...source, config: source.config.replace("candidates.sort((a, b) => b.route.length - a.route.length)", "candidates.reverse()") }),
  ]);
  let rejected = 0;
  for (const [name, mutate] of mutations) {
    if (failuresFor(mutate(sources)).length > 0) rejected += 1;
    else console.error(`mutation survived: ${name}`);
  }
  if (rejected !== mutations.length) process.exit(1);
  console.log(`verify-safety-mounted-route-identity selftest: ${rejected}/${mutations.length} mutations rejected`);
  process.exit(0);
}

const failures = failuresFor(sources);
if (failures.length > 0) {
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}
console.log(`verify-safety-mounted-route-identity: PASS — ${owed.length} mounted leaves retain canonical Safety chrome`);
