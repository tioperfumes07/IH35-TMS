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

/** Source span of the `{activeTab === "<label>" ? (` branch: from its test to the next tab branch. */
function branchSpan(text, label) {
  const start = text.indexOf(`activeTab === "${label}"`);
  if (start < 0) return null;
  const next = text.indexOf("activeTab === \"", start + 1);
  return [start, next < 0 ? text.length : next];
}

// 443.99 (2026-10-12) — "fuel verdicts not under Legal" check re-anchored.
//   old rule: indexOf('activeTab === "Legal"') then the first DriverProfileFuelVerdictsSection after it
//             must not come before the Fuel branch.
//   new rule: every RENDERED <DriverProfileFuelVerdictsSection (not the import) must sit inside the
//             `activeTab === "Fuel"` branch, and none inside the Legal branch ("Legal matters", or the
//             legacy "Legal" label).
//   why: DRV-F420 (#25517, 2026f27d5a) renamed the tab to "Legal matters". With no "Legal" branch the old
//        search started at index -1, matched the import on line 21, and reported the section "under
//        Legal" although it renders only in the Fuel tab. Not looser: a verdicts block moved into Legal
//        matters, or rendered outside the Fuel tab, still fails.
export function findProblems(files) {
  const problems = [];
  for (const c of checks) {
    const text = files[c.file];
    if (text == null) {
      problems.push(`missing ${c.file}`);
      continue;
    }
    for (const n of c.needles) {
      if (!text.includes(n)) problems.push(`${c.file}: missing ${JSON.stringify(n)}`);
    }
    if (c.file.endsWith("DriverProfilePage.tsx")) {
      const fuel = branchSpan(text, "Fuel");
      if (!fuel) problems.push("Fuel tab branch missing");
      const legal = branchSpan(text, "Legal matters") ?? branchSpan(text, "Legal");
      const uses = [...text.matchAll(/<DriverProfileFuelVerdictsSection\b/g)].map((m) => m.index);
      if (uses.length === 0) problems.push("DriverProfileFuelVerdictsSection is imported but never rendered");
      for (const at of uses) {
        if (legal && at > legal[0] && at < legal[1]) {
          problems.push("DriverProfileFuelVerdictsSection still rendered under Legal");
        } else if (fuel && !(at > fuel[0] && at < fuel[1])) {
          problems.push("DriverProfileFuelVerdictsSection rendered outside the Fuel tab");
        }
      }
    }
  }
  return problems;
}

const read = () => Object.fromEntries(checks.map((c) => {
  const abs = path.join(ROOT, c.file);
  return [c.file, fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null];
}));

if (process.argv.includes("--selftest")) {
  const real = read();
  const PAGE = "apps/frontend/src/pages/drivers/DriverProfilePage.tsx";
  const page = real[PAGE];
  const verdicts = /\{companyId \? <DriverProfileFuelVerdictsSection[^\n]*\n/.exec(page)?.[0];
  if (!verdicts) {
    console.error(`${LABEL} --selftest FAIL: anchor missing (rendered verdicts line)`);
    process.exit(1);
  }
  // Plant: lift the verdicts line out of the Fuel branch and drop it right inside the Legal matters branch.
  const without = page.replace(verdicts, "");
  const legalAt = without.indexOf('activeTab === "Legal matters"');
  const legalOpen = without.indexOf("\n", without.indexOf("(", legalAt)) + 1;
  const planted = [
    ["verdicts moved into Legal matters", { ...real, [PAGE]: without.slice(0, legalOpen) + verdicts + without.slice(legalOpen) }],
    ["verdicts no longer rendered", { ...real, [PAGE]: without }],
    ["Fuel tab branch removed", { ...real, [PAGE]: page.replace('activeTab === "Fuel"', 'activeTab === "Fuel (old)"') }],
    ["Fuel tab dropped from the tab list", { ...real, "apps/frontend/src/pages/drivers/driverProfileTabs.ts": real["apps/frontend/src/pages/drivers/driverProfileTabs.ts"].replaceAll('Fuel: "fuel"', 'Fuel: "legal"') }],
  ];
  let caught = 0;
  for (const [name, files] of planted) {
    if (findProblems(files).length > 0) caught += 1;
    else console.error(`${LABEL} --selftest: planted violation escaped — ${name}`);
  }
  const clean = findProblems(real);
  if (clean.length) console.error(`${LABEL} --selftest: clean tree flagged — ${clean.join("; ")}`);
  console.log(`${LABEL} SELFTEST: ${caught}/${planted.length} planted violations caught`);
  process.exit(caught === planted.length && clean.length === 0 ? 0 : 1);
}

const problems = findProblems(read());
if (problems.length) {
  console.error(`${LABEL} FAIL:\n  - ${problems.join("\n  - ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — Driver Profile Fuel tab hosts E-21/E-22 verdicts (§ ORDERS 2026-10-01)`);
