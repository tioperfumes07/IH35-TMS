#!/usr/bin/env node
/**
 * Onboarding vehicle step — EntityPicker unit (not silent listUnits limit:500 + <select>).
 * Cursor even claim: 2128.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-onboarding-unit-entity-picker";
const WIZARD = "apps/frontend/src/pages/drivers/OnboardingWizardPage.tsx";
const STEP = "apps/frontend/src/pages/drivers/onboarding/OnboardingStepVehicleAssignment.tsx";

function readRel(root, rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

/** @returns {string[]} */
export function collectProblems(root = ROOT) {
  const problems = [];
  const wizard = readRel(root, WIZARD);
  const step = readRel(root, STEP);
  if (!wizard) problems.push(`missing ${WIZARD}`);
  if (!step) problems.push(`missing ${STEP}`);
  if (!wizard || !step) return problems;

  const wizardCode = wizard.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const stepCode = step.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  if (/listUnits\(/.test(wizardCode) || /limit:\s*500/.test(wizardCode)) {
    problems.push(`${WIZARD}: must not silent-fetch listUnits(limit:500)`);
  }
  if (!/EntityPicker/.test(stepCode) || !/kind=["']unit["']/.test(stepCode)) {
    problems.push(`${STEP}: must use EntityPicker kind="unit"`);
  }
  if (/<select[\s>]/.test(stepCode)) {
    problems.push(`${STEP}: must not use native <select> for unit`);
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const baseline = collectProblems();
  if (baseline.length) {
    console.error(`${LABEL} SELFTEST FAIL:`);
    for (const p of baseline) console.error("  - " + p);
    process.exit(1);
  }
  const stubRoot = fs.mkdtempSync(path.join(ROOT, ".tmp-onboarding-unit-"));
  try {
    const dir = path.join(stubRoot, "apps/frontend/src/pages/drivers/onboarding");
    fs.mkdirSync(dir, { recursive: true });
    fs.mkdirSync(path.join(stubRoot, "apps/frontend/src/pages/drivers"), { recursive: true });
    fs.writeFileSync(
      path.join(stubRoot, WIZARD),
      `listUnits({ operating_company_id: companyId, limit: 500 })`
    );
    fs.writeFileSync(
      path.join(stubRoot, STEP),
      `<select value={unitId}>{unitOptions.map(u => <option key={u.id}>{u.label}</option>)}</select>`
    );
    const planted = collectProblems(stubRoot);
    if (!planted.length) {
      console.error(`${LABEL} SELFTEST FAIL: planted stub did not FAIL`);
      process.exit(1);
    }
  } finally {
    fs.rmSync(stubRoot, { recursive: true, force: true });
  }
  console.log(`${LABEL} SELFTEST OK`);
} else {
  const problems = collectProblems();
  if (problems.length) {
    console.error(`${LABEL} FAIL:`);
    for (const p of problems) console.error("  - " + p);
    process.exit(1);
  }
  console.log(`${LABEL} OK — onboarding unit EntityPicker`);
}
