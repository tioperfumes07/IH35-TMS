#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.env.VERIFY_ELD_ROOT ?? process.cwd();
const tabsConfigPath =
  process.env.VERIFY_ELD_TABS_CONFIG_PATH ?? path.join(ROOT, "apps/frontend/src/pages/eld/ELD_TABS_CONFIG.ts");
const pagePath = process.env.VERIFY_ELD_PAGE_PATH ?? path.join(ROOT, "apps/frontend/src/pages/eld/EldPage.tsx");
const sidebarPath =
  process.env.VERIFY_ELD_SIDEBAR_PATH ?? path.join(ROOT, "apps/frontend/src/components/layout/sidebar-config.ts");
const routesPath = process.env.VERIFY_ELD_ROUTES_PATH ?? path.join(ROOT, "apps/frontend/src/routes/manifest.tsx");

const requiredTabs = [
  ["live-duty", "Live Duty Status"],
  ["violations", "HOS Violations"],
  ["unidentified", "Unidentified Driving"],
  ["certifications", "Driver Certifications"],
  ["settings", "ELD Settings"],
];

function read(filePath) {
  if (!fs.existsSync(filePath)) return "";
  return fs.readFileSync(filePath, "utf8");
}

function main() {
  const tabsConfig = read(tabsConfigPath);
  const page = read(pagePath);
  const sidebar = read(sidebarPath);
  const routes = read(routesPath);
  const failures = [];

  for (const [id, label] of requiredTabs) {
    if (!tabsConfig.includes(`id: "${id}"`)) failures.push(`missing_tab_id:${id}`);
    if (!tabsConfig.includes(`label: "${label}"`)) failures.push(`missing_tab_label:${label}`);
  }

  if (!page.includes("ELD_TABS_CONFIG")) failures.push("missing_tabs_config_usage:EldPage");
  if (!page.includes("activeTab")) failures.push("missing_active_tab_state:EldPage");
  if (!sidebar.includes('eld: { id: "eld"')) failures.push("missing_sidebar_item:eld");
  if (!routes.includes('path="/eld"')) failures.push("missing_route:/eld");

  if (failures.length > 0) {
    console.error("verify:eld-foundation-coverage FAILED");
    for (const failure of failures) console.error(` - ${failure}`);
    process.exit(1);
  }

  console.log("verify:eld-foundation-coverage OK");
}

main();
