#!/usr/bin/env node
/**
 * verify-drivers-deductions-tab-distinct — 0441-mod5-deductions-tab-wrong-content
 * UPDATED C-33 / Round 298.1: Deductions are a sub-ledger UNDER Settlements
 * (not a peer Drivers tab). Still must NOT share the Cash advances Debt Alert panel.
 *
 * Self-test: node scripts/verify-drivers-deductions-tab-distinct.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = path.join(ROOT, "apps/frontend/src/pages/Drivers.tsx");
const TABS = path.join(ROOT, "apps/frontend/src/components/drivers/DRIVERS_TABS_CONFIG.ts");
const LABEL = "verify-drivers-deductions-tab-distinct";

/**
 * @param {string} source
 * @param {string} [tabsSource]
 * @returns {string[]}
 */
export function computeFailures(source, tabsSource = "") {
  const errors = [];

  if (/subnavTab\s*===\s*["']cash_advances["']\s*\|\|\s*subnavTab\s*===\s*["']deductions["']/.test(source)) {
    errors.push("Drivers.tsx must not OR cash_advances with deductions for the same panel");
  }
  if (/subnavTab\s*===\s*["']deductions["']\s*\|\|\s*subnavTab\s*===\s*["']cash_advances["']/.test(source)) {
    errors.push("Drivers.tsx must not OR deductions with cash_advances for the same panel");
  }

  if (!/subnavTab\s*===\s*["']cash_advances["']/.test(source)) {
    errors.push("Drivers.tsx must keep a cash_advances-only branch");
  }

  // C-33 — deductions live under Settlements, not as a peer tab.
  if (tabsSource && /id:\s*"deductions"/.test(tabsSource)) {
    errors.push("DRIVERS_SUBNAV must not list deductions as a peer tab (C-33 — under Settlements)");
  }
  if (!/subnavTab\s*===\s*["']settlements["']/.test(source)) {
    errors.push("Drivers.tsx must keep a settlements branch that hosts deductions");
  }

  if (!/AutoDeductionPoliciesPanel/.test(source)) {
    errors.push("Drivers.tsx settlements/deductions surface must render AutoDeductionPoliciesPanel");
  }
  if (!/data-testid=["']drivers-deductions-panel["']/.test(source)) {
    errors.push("Drivers.tsx must expose data-testid=drivers-deductions-panel under Settlements");
  }
  if (!/data-testid=["']drivers-cash-advances-debt-alert["']/.test(source)) {
    errors.push("Drivers.tsx must expose data-testid=drivers-cash-advances-debt-alert on the cash_advances branch");
  }

  return errors;
}

function selftest() {
  const good = `
    import { AutoDeductionPoliciesPanel } from "./drivers/AutoDeductionPolicies";
    {subnavTab === "cash_advances" ? (
      <div data-testid="drivers-cash-advances-debt-alert"><DataPanel title="Debt Alert" /></div>
    ) : null}
    {subnavTab === "settlements" ? (
      <div data-testid="drivers-deductions-panel"><AutoDeductionPoliciesPanel /></div>
    ) : null}
  `;
  const goodTabs = `export const DRIVERS_SUBNAV = [{ id: "settlements" }, { id: "cash_advances" }];`;
  const badShared = `
    {subnavTab === "cash_advances" || subnavTab === "deductions" ? (
      <DataPanel title="Debt Alert · before any payment" />
    ) : null}
  `;
  const badPeerTabs = `export const DRIVERS_SUBNAV = [{ id: "deductions" }];`;
  let ok = true;
  for (const c of [
    { name: "distinct under settlements", input: good, tabs: goodTabs, expectPass: true },
    { name: "shared OR condition", input: badShared, tabs: goodTabs, expectPass: false },
    { name: "peer deductions tab", input: good, tabs: badPeerTabs, expectPass: false },
  ]) {
    const failures = computeFailures(c.input, c.tabs);
    const passed = failures.length === 0;
    if (passed !== c.expectPass) {
      ok = false;
      console.error(`SELFTEST FAIL — ${c.name}: ${JSON.stringify(failures)}`);
    } else {
      console.log(`selftest ok — ${c.name}`);
    }
  }
  if (!ok) process.exit(1);
  console.log(`${LABEL} --selftest OK`);
}

function run() {
  const source = fs.readFileSync(PAGE, "utf8");
  const tabsSource = fs.readFileSync(TABS, "utf8");
  const failures = computeFailures(source, tabsSource);
  if (failures.length) {
    console.error(`[${LABEL}] FAIL:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] OK — Drivers deductions under Settlements, distinct from cash advances`);
}

if (process.argv.includes("--selftest")) selftest();
else run();
