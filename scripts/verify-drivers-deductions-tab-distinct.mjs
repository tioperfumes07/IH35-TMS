#!/usr/bin/env node
/**
 * verify-drivers-deductions-tab-distinct — 0441-mod5-deductions-tab-wrong-content
 *
 * Drivers hub `deductions` subnav must NOT share the Cash advances Debt Alert panel.
 * It must render a distinct surface (AutoDeductionPoliciesPanel / drivers-deductions-panel).
 *
 * Self-test: node scripts/verify-drivers-deductions-tab-distinct.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = path.join(ROOT, "apps/frontend/src/pages/Drivers.tsx");
const LABEL = "verify-drivers-deductions-tab-distinct";

/**
 * @param {string} source
 * @returns {string[]}
 */
export function computeFailures(source) {
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
  if (!/subnavTab\s*===\s*["']deductions["']/.test(source)) {
    errors.push("Drivers.tsx must keep a deductions-only branch");
  }

  if (!/AutoDeductionPoliciesPanel/.test(source)) {
    errors.push("Drivers.tsx deductions tab must render AutoDeductionPoliciesPanel");
  }
  if (!/data-testid=["']drivers-deductions-panel["']/.test(source)) {
    errors.push("Drivers.tsx must expose data-testid=drivers-deductions-panel on the deductions branch");
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
    {subnavTab === "deductions" ? (
      <div data-testid="drivers-deductions-panel"><AutoDeductionPoliciesPanel /></div>
    ) : null}
  `;
  const badShared = `
    {subnavTab === "cash_advances" || subnavTab === "deductions" ? (
      <DataPanel title="Debt Alert · before any payment" />
    ) : null}
  `;
  let ok = true;
  for (const c of [
    { name: "distinct panels", input: good, expectPass: true },
    { name: "shared OR condition", input: badShared, expectPass: false },
  ]) {
    const failures = computeFailures(c.input);
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
  const failures = computeFailures(source);
  if (failures.length) {
    console.error(`[${LABEL}] FAIL:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] OK — Drivers deductions tab is distinct from cash advances`);
}

if (process.argv.includes("--selftest")) selftest();
else run();
