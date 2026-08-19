#!/usr/bin/env node
/**
 * verify-saf-integrity-csa-mutation-error-surface
 * SAF-INTEGRITY-CSA-MUTATION-SILENT-FAIL — IntegrityAlerts evaluate/save-rule and
 * CSAMitigationQueue complete mutations must surface isError (not silent no-ops).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-saf-integrity-csa-mutation-error-surface";
const CHECKS = [
  {
    file: "apps/frontend/src/pages/safety/IntegrityAlertsPage.tsx",
    needles: ["evaluateMutation.isError", "saveRuleMutation.isError", "userFacingApiError", "integrity-evaluate-error", "integrity-rule-save-error"],
  },
  {
    file: "apps/frontend/src/pages/safety/CSAMitigationQueue.tsx",
    needles: ["completeMutation.isError", "userFacingApiError", "csa-mitigation-complete-error"],
  },
];

function assertFile(rel, needles) {
  const src = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
  return needles.filter((n) => !src.includes(n)).map((n) => `${rel}: missing ${n}`);
}

function selftest() {
  const bad = `onClick={() => evaluateMutation.mutate()}`;
  const good = `evaluateMutation.isError\nsaveRuleMutation.isError\nuserFacingApiError\nintegrity-evaluate-error\nintegrity-rule-save-error`;
  const tmp = path.join(process.cwd(), ".tmp-integrity-csa-selftest.tsx");
  fs.writeFileSync(tmp, bad);
  try {
    if (assertFile(".tmp-integrity-csa-selftest.tsx", ["evaluateMutation.isError"]).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — bad should fail`);
      process.exit(1);
    }
  } finally {
    fs.unlinkSync(tmp);
  }
  fs.writeFileSync(tmp, good);
  try {
    if (assertFile(".tmp-integrity-csa-selftest.tsx", ["evaluateMutation.isError", "saveRuleMutation.isError", "userFacingApiError", "integrity-evaluate-error", "integrity-rule-save-error"]).length > 0) {
      console.error(`${LABEL} SELFTEST FAIL — good should pass`);
      process.exit(1);
    }
  } finally {
    fs.unlinkSync(tmp);
  }
  console.log(`${LABEL} selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const errors = [];
for (const c of CHECKS) {
  if (!fs.existsSync(path.join(process.cwd(), c.file))) {
    errors.push(`missing ${c.file}`);
    continue;
  }
  errors.push(...assertFile(c.file, c.needles));
}
if (errors.length) {
  console.error(`${LABEL} FAIL:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — Integrity evaluate/save + CSA complete surface isError`);
