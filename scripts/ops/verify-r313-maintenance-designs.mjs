#!/usr/bin/env node
/**
 * R313 Cursor item 3 — Maintenance designs: primary subnav exposes WO / PM Due / Faults /
 * In Shop / Parts / Cost/mi (approved-screens + ROUND-313 ORDERS). Paths must stay live.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const LABEL = "verify-r313-maintenance-designs";

const REQUIRED = [
  { file: "apps/frontend/src/pages/maintenance/MaintenanceHome.tsx", needles: ['label: "PM Due"', 'label: "Faults"', 'label: "In Shop"', 'label: "Cost/mi"', "maintenancePrimarySubNavItems"] },
  { file: "apps/frontend/src/router/route-manifest.ts", needles: ["pm_due:", "faults:", "in_shop:", "cost_per_mile:", '"/maintenance/pm-schedule"', '"/maintenance/fault-code-alerts"'] },
  { file: "apps/frontend/src/pages/maintenance/MaintenanceHome.tsx", needles: ["NavyPageSubNav items={maintenancePrimarySubNavItems()}", "data-testid=\"maintenance-shell-r313\""] },
];

function check() {
  const problems = [];
  for (const req of REQUIRED) {
    const abs = path.join(ROOT, req.file);
    if (!fs.existsSync(abs)) {
      problems.push(`missing ${req.file}`);
      continue;
    }
    const text = fs.readFileSync(abs, "utf8");
    for (const n of req.needles) {
      if (!text.includes(n)) problems.push(`${req.file}: missing ${JSON.stringify(n)}`);
    }
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const problems = check();
  if (problems.length) {
    console.error(`${LABEL} --selftest FAIL:\n  - ${problems.join("\n  - ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} PASS — PM Due · Faults · In Shop · Cost/mi on primary Maintenance subnav (R313 #3)`);
  process.exit(0);
}

const problems = check();
if (problems.length) {
  console.error(`${LABEL} FAIL:\n  - ${problems.join("\n  - ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — R313 Maintenance designs subnav wired`);
