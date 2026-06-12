#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.env.VERIFY_SAFETY_TAB_ROOT ?? process.cwd();
const configPath =
  process.env.VERIFY_SAFETY_TAB_CONFIG_PATH ??
  path.join(ROOT, "apps/frontend/src/components/safety/SAFETY_TABS_CONFIG.ts");
const backendPath =
  process.env.VERIFY_SAFETY_TAB_BACKEND_PATH ??
  path.join(ROOT, "apps/backend/src/safety/foundation-kpis.routes.ts");

const EXPECTED_GROUP_COUNT = 9;
const EXPECTED_TAB_COUNT = 25;

const groups = [
  "Driver Files & Training",
  "Hours & Fatigue",
  "Inspections & FMCSA",
  "Incidents & Claims",
  "Fines & Discipline",
  "Driver Financial Safety",
  "Compliance Docs & Monitoring",
  "Workforce Planning",
  "Settings",
];

const tabs = [
  ["driver-files", "driver-files"],
  ["driver-files", "drug-alcohol"],
  ["driver-files", "safety-meetings"],
  ["hours-fatigue", "hos"],
  ["hours-fatigue", "hos-violations"],
  ["inspections-fmcsa", "idvr"],
  ["inspections-fmcsa", "dot-inspections"],
  ["inspections-fmcsa", "driver-scoring"],
  ["inspections-fmcsa", "csa-score"],
  ["inspections-fmcsa", "dot-compliance"],
  ["incidents-claims", "safety-events"],
  ["incidents-claims", "accidents"],
  ["incidents-claims", "damage-reports"],
  ["incidents-claims", "trailer-interchanges"],
  ["incidents-claims", "cargo-claims"],
  ["fines-discipline", "internal-fines"],
  ["fines-discipline", "external-fines"],
  ["driver-financial", "escrow-record"],
  ["compliance-monitoring", "insurance"],
  ["compliance-monitoring", "permits"],
  ["compliance-monitoring", "integrity-reports"],
  ["workforce-planning", "driver-scheduler"],
  ["workforce-planning", "leave-requests"],
  ["workforce-planning", "leave-balances"],
  ["settings", "settings"],
];

function read(filePath) {
  if (!fs.existsSync(filePath)) return "";
  return fs.readFileSync(filePath, "utf8");
}

function main() {
  const config = read(configPath);
  const backend = read(backendPath);
  const failures = [];

  const isFixture = Boolean(process.env.VERIFY_SAFETY_TAB_CONFIG_PATH);
  if (!isFixture) {
    if (!config.includes(`SAFETY_CANONICAL_GROUP_COUNT = ${EXPECTED_GROUP_COUNT}`)) {
      failures.push(`canonical_group_count_not_${EXPECTED_GROUP_COUNT}`);
    }
    if (!config.includes(`SAFETY_CANONICAL_TAB_COUNT = ${EXPECTED_TAB_COUNT}`)) {
      failures.push(`canonical_tab_count_not_${EXPECTED_TAB_COUNT}`);
    }
  }

  for (const group of groups) {
    if (!config.includes(group)) failures.push(`missing_group:${group}`);
  }

  if (tabs.length !== EXPECTED_TAB_COUNT) {
    failures.push(`tabs_fixture_count:${tabs.length}`);
  }

  for (const [group, tab] of tabs) {
    if (!config.includes(`id: "${tab}"`)) failures.push(`missing_tab_config:${tab}`);
    if (!backend.includes(`"${group}", "${tab}"`)) failures.push(`missing_backend_kpi:${group}/${tab}`);
  }

  if (failures.length > 0) {
    console.error("verify:safety-tab-coverage FAILED");
    for (const f of failures) console.error(` - ${f}`);
    process.exit(1);
  }

  console.log(`verify:safety-tab-coverage OK (${EXPECTED_TAB_COUNT} tabs / ${EXPECTED_GROUP_COUNT} groups)`);
}

main();
