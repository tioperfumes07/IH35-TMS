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

const groups = [
  "Driver Files & Training",
  "Hours & Fatigue",
  "Inspections & FMCSA",
  "Incidents & Claims",
  "Fines & Discipline",
  "Driver Financial Safety",
  "Compliance Docs & Monitoring",
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
  ["inspections-fmcsa", "csa-score"],
  ["inspections-fmcsa", "dot-compliance"],
  ["incidents-claims", "accidents"],
  ["incidents-claims", "damage-reports"],
  ["incidents-claims", "trailer-interchanges"],
  ["incidents-claims", "cargo-claims"],
  ["fines-discipline", "internal-fines"],
  ["fines-discipline", "external-fines"],
  ["fines-discipline", "complaints"],
  ["driver-financial", "escrow-record"],
  ["compliance-monitoring", "insurance"],
  ["compliance-monitoring", "permits"],
  ["compliance-monitoring", "integrity-reports"],
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

  for (const group of groups) {
    if (!config.includes(group)) failures.push(`missing_group:${group}`);
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

  console.log("verify:safety-tab-coverage OK");
}

main();
