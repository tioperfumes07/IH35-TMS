#!/usr/bin/env node
/** LST-F110 — OnboardingWizardPage subtitle must not lead with a UUID fragment. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "apps/frontend/src/pages/drivers/OnboardingWizardPage.tsx";
const LABEL = "verify-onboarding-wizard-human-subtitle";
const SELFTEST = process.argv.includes("--selftest");

function assert(src) {
  const problems = [];
  if (/Session \$\{session\.id\.slice\(0,\s*8\)\}/.test(src) || /session\.id\.slice\(0,\s*8\)/.test(src)) {
    problems.push(`${FILE}: subtitle still uses session.id.slice(0, 8)`);
  }
  if (!/ONBOARDING_STEP_LABELS\[activeStep\]/.test(src) && !/stepLabel/.test(src)) {
    problems.push(`${FILE}: subtitle must include step label`);
  }
  if (!/statusLabel/.test(src)) {
    problems.push(`${FILE}: subtitle must include human statusLabel`);
  }
  return problems;
}

if (SELFTEST) {
  const live = fs.readFileSync(path.join(ROOT, FILE), "utf8");
  const planted = live.replace(
    /subtitle=\{`\$\{statusLabel\}[\s\S]*?`\}/,
    "subtitle={`Session ${session.id.slice(0, 8)}… · save + resume · docs module uploads`}",
  );
  if (!assert(planted).length) {
    console.error(`${LABEL} SELFTEST FAILED: planted defect not caught`);
    process.exit(1);
  }
  const liveProblems = assert(live);
  if (liveProblems.length) {
    console.error(`${LABEL} SELFTEST FAILED live: ${liveProblems.join(" | ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assert(fs.readFileSync(path.join(ROOT, FILE), "utf8"));
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK`);
