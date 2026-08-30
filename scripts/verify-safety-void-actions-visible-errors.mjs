#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const CASES = [
  {
    file: "apps/frontend/src/pages/safety/tabs/ComplaintsTab.tsx",
    tokens: ["voidErrorCurrent", "complaint-void-error", "Could not void the complaint."],
  },
  {
    file: "apps/frontend/src/pages/safety/tabs/DOTInspectionsTab.tsx",
    tokens: ["voidMutation.variables?.generation === companyGenerationRef.current", "dot-inspection-void-error", "Could not void the DOT inspection."],
  },
  {
    file: "apps/frontend/src/pages/safety/tabs/HOSViolationsTab.tsx",
    tokens: ["voidMutation.variables?.generation === companyGenerationRef.current", "hos-violation-void-error", "Could not void the HOS violation."],
  },
];

function failuresFor(sourceByFile) {
  const failures = [];
  for (const entry of CASES) {
    const source = sourceByFile.get(entry.file);
    if (!source) {
      failures.push(`${entry.file}: missing source`);
      continue;
    }
    for (const token of entry.tokens) {
      if (!source.includes(token)) failures.push(`${entry.file}: missing ${token}`);
    }
    if (!source.includes("voidMutation.isError")) failures.push(`${entry.file}: missing voidMutation.isError`);
    if (!source.includes("userFacingApiError(voidMutation.error")) failures.push(`${entry.file}: missing user-facing void error`);
  }
  return failures;
}

const realSources = new Map(
  CASES.map((entry) => [entry.file, fs.readFileSync(path.join(ROOT, entry.file), "utf8")])
);

if (process.argv.includes("--selftest")) {
  let caught = 0;
  for (const entry of CASES) {
    const mutated = new Map(realSources);
    mutated.set(entry.file, realSources.get(entry.file).replace("voidMutation.isError", "voidMutation.isPending"));
    const failures = failuresFor(mutated);
    if (!failures.some((failure) => failure.startsWith(`${entry.file}:`))) {
      console.error(`SELFTEST INERT: ${entry.file} visible void error removal was not caught`);
      process.exit(1);
    }
    caught += 1;
  }
  console.log(`verify-safety-void-actions-visible-errors --selftest PASS ${caught}/${CASES.length}`);
  process.exit(0);
}

const failures = failuresFor(realSources);
if (failures.length) {
  console.error("verify-safety-void-actions-visible-errors FAIL");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log("verify-safety-void-actions-visible-errors PASS — complaint, DOT inspection, and HOS void failures remain visible and company-generation scoped");
