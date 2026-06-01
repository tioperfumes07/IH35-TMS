#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const maintenanceHomePath = path.join(ROOT, "apps/frontend/src/pages/maintenance/MaintenanceHome.tsx");

function fail(message) {
  console.error(`verify:maint-jump-to-tab-removed failed: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(maintenanceHomePath)) {
  fail("missing MaintenanceHome.tsx");
}

const source = fs.readFileSync(maintenanceHomePath, "utf8");

if (source.includes("HoverDropdown")) {
  fail("MaintenanceHome.tsx still references HoverDropdown for tab jumping");
}

if (source.includes("Jump to tab")) {
  fail("MaintenanceHome.tsx still renders 'Jump to tab' UI");
}

console.log("verify:maint-jump-to-tab-removed: ok");
