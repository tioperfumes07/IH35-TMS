#!/usr/bin/env node
/**
 * ROUND 319 / ORDERS — Driver Profile Fuel tab hosts E-21/E-22 verdicts + fuel reverse
 * sections (not buried under Legal).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const LABEL = "verify-r319-driver-fuel-tab";

const checks = [
  {
    file: "apps/frontend/src/pages/drivers/driverProfileTabs.ts",
    needles: ['"Fuel"', 'Fuel: "fuel"'],
  },
  {
    file: "apps/frontend/src/pages/drivers/DriverProfilePage.tsx",
    needles: [
      'activeTab === "Fuel"',
      'data-testid="dp-tab-fuel"',
      "DriverProfileFuelVerdictsSection",
      "FuelTransactionsReverseSection",
    ],
  },
];

function run() {
  const problems = [];
  for (const c of checks) {
    const abs = path.join(ROOT, c.file);
    if (!fs.existsSync(abs)) {
      problems.push(`missing ${c.file}`);
      continue;
    }
    const text = fs.readFileSync(abs, "utf8");
    for (const n of c.needles) {
      if (!text.includes(n)) problems.push(`${c.file}: missing ${JSON.stringify(n)}`);
    }
    // Fuel block must not still live only under Legal without Fuel tab.
    if (c.file.endsWith("DriverProfilePage.tsx")) {
      const legalIdx = text.indexOf('activeTab === "Legal"');
      const fuelIdx = text.indexOf('activeTab === "Fuel"');
      const fuelUnderLegal = text.indexOf("DriverProfileFuelVerdictsSection", legalIdx);
      if (fuelIdx < 0) problems.push("Fuel tab branch missing");
      if (fuelUnderLegal > legalIdx && fuelUnderLegal < fuelIdx) {
        problems.push("DriverProfileFuelVerdictsSection still rendered under Legal before Fuel tab");
      }
    }
  }
  return problems;
}

const problems = run();
if (problems.length) {
  console.error(`${LABEL} FAIL:\n  - ${problems.join("\n  - ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — Driver Profile Fuel tab hosts E-21/E-22 verdicts (§ ORDERS 2026-10-01)`);
