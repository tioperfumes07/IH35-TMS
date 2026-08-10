#!/usr/bin/env node
/** INBOX-DEVIN-A 9–23 FE wiring ratchet — static only, USMCA fleet/fuel/tasks/compliance chrome. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-usmca-inbox9-23-fe";

const CHECKS = [
  {
    file: "apps/frontend/src/pages/fleet/FleetHomePage.tsx",
    tests: [
      (s) => /data-testid="fleet-need-company"/.test(s) || "fleet need-company testid",
      (s) => /data-testid="fleet-create-unit"/.test(s) || "fleet + Create Unit",
      (s) => /FleetTablePage operatingCompanyId=\{companyId\}/.test(s) || "lease-scoped roster",
    ],
  },
  {
    file: "apps/frontend/src/pages/fuel/card-overage/CardOverageQueuePage.tsx",
    tests: [(s) => /data-testid="fuel-card-overage-need-company"/.test(s) || "card-overage need-company"],
  },
  {
    file: "apps/frontend/src/pages/fuel/FuelPlannerHome.tsx",
    tests: [
      (s) => /Import Fuel Transactions/.test(s) || "fuel import CTA",
      (s) => /No fuel transactions for USMCA yet/.test(s) || "honest empty fuel history",
    ],
  },
  {
    file: "apps/frontend/src/components/tasks/CreateTaskModal.tsx",
    tests: [(s) => /data-testid="create-task-assignee-picker"/.test(s) || "tasks +Create assignee picker"],
  },
  {
    file: "apps/frontend/src/pages/tasks/TaskPlannerGrid.tsx",
    tests: [(s) => /export function overdueRolloverDay/.test(s) || "overdue rollover helper"],
  },
  {
    file: "apps/frontend/src/pages/compliance/PropertyTaxRenditionPage.tsx",
    tests: [
      (s) => /PropertyTaxRenditionPage/.test(s) && /RenditionListView/.test(s) || "property-tax page",
      (s) => /<Combobox[\s\S]*id="property-tax-district-picker"[\s\S]*allowAddNew=/.test(s) || "searchable appraisal-district picker with inline create",
      (s) => !/<select[\s\S]*value=\{districtId\}/.test(s) || "appraisal district must not use a native ID-valued select",
    ],
  },
  {
    file: "apps/frontend/src/components/vehicle-profile/CurrentLoadSection.tsx",
    tests: [(s) => /EntityLink[\s\S]*kind="load"/.test(s) || "unit current load EntityLink"],
  },
];

function run() {
  const problems = [];
  for (const { file, tests } of CHECKS) {
    const abs = path.join(ROOT, file);
    if (!fs.existsSync(abs)) {
      problems.push(`missing ${file}`);
      continue;
    }
    const src = fs.readFileSync(abs, "utf8");
    for (const t of tests) {
      const msg = t(src);
      if (typeof msg === "string") problems.push(`${file}: ${msg}`);
    }
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const problems = run();
  if (!problems.length) {
    console.error(`${LABEL} SELFTEST FAIL: nothing to catch on green tree`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS (green tree has wiring)`);
  process.exit(0);
}

const problems = run();
if (problems.length) {
  console.error(`${LABEL} FAIL:\n` + problems.map((p) => `  ✗ ${p}`).join("\n"));
  process.exit(1);
}
console.log(`${LABEL} PASS`);
