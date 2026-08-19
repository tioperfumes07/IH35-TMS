#!/usr/bin/env node
/**
 * verify-saf-dot-followup-mutation-error-surface
 * SAF-DOT-FOLLOWUP-MUTATION-SILENT-FAIL — DOT followUp + PDF upload must surface isError.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-saf-dot-followup-mutation-error-surface";
const CHECKS = [
  {
    file: "apps/frontend/src/pages/safety/tabs/DOTInspectionsTab.tsx",
    needles: [
      "userFacingApiError",
      "followUpMutation.isError",
      "uploadMutation.isError",
      "dot-inspection-followup-error",
      "dot-inspection-upload-error",
    ],
  },
  {
    file: "apps/frontend/src/pages/safety/DotInspectionsPage.tsx",
    needles: ["userFacingApiError", "followUpMutation.isError", "dot-inspection-page-followup-error"],
  },
];

function assertFile(rel, needles) {
  const src = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
  return needles.filter((n) => !src.includes(n)).map((n) => `${rel}: missing ${n}`);
}

function selftest() {
  const bad = `onClick={() => followUpMutation.mutate({})}`;
  const good = CHECKS[0].needles.join("\n");
  const tmp = path.join(process.cwd(), ".tmp-dot-followup-selftest.tsx");
  fs.writeFileSync(tmp, bad);
  try {
    if (assertFile(".tmp-dot-followup-selftest.tsx", ["followUpMutation.isError"]).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL bad`);
      process.exit(1);
    }
  } finally {
    fs.unlinkSync(tmp);
  }
  fs.writeFileSync(tmp, good);
  try {
    if (assertFile(".tmp-dot-followup-selftest.tsx", CHECKS[0].needles).length > 0) {
      console.error(`${LABEL} SELFTEST FAIL good`);
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
console.log(`${LABEL} PASS — DOT followUp/upload mutations surface isError`);
