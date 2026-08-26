#!/usr/bin/env node
/**
 * verify-saf-action-mutation-error-wave3
 * SAF-ACTION-MUTATION-SILENT-FAIL-WAVE3 — CSA recompute, meeting attendance,
 * permits reminder/archive/restore must surface isError.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-saf-action-mutation-error-wave3";
const CHECKS = [
  {
    file: "apps/frontend/src/pages/safety/tabs/CSAScoreTab.tsx",
    needles: ["userFacingApiError", "recomputeError", "csa-recompute-error"],
  },
  {
    file: "apps/frontend/src/pages/safety/SafetyMeetingsPage.tsx",
    needles: ["attendanceMutation.isError", "safety-meeting-attendance-error", "userFacingApiError"],
  },
  {
    file: "apps/frontend/src/pages/safety/PermitsPage.tsx",
    needles: [
      "reminderMutation.isError",
      "archiveMutation.isError",
      "restoreMutation.isError",
      "permits-reminder-error",
      "permits-archive-restore-error",
      "userFacingApiError",
    ],
  },
];

function assertFile(rel, needles) {
  const src = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
  return needles.filter((n) => !src.includes(n)).map((n) => `${rel}: missing ${n}`);
}

function selftest() {
  const bad = `onClick={() => recomputeMutation.mutate()}`;
  const good = CHECKS[0].needles.join("\n");
  const tmp = path.join(process.cwd(), ".tmp-saf-wave3-selftest.tsx");
  fs.writeFileSync(tmp, bad);
  try {
    if (assertFile(".tmp-saf-wave3-selftest.tsx", ["recomputeMutation.isError"]).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL bad`);
      process.exit(1);
    }
  } finally {
    fs.unlinkSync(tmp);
  }
  fs.writeFileSync(tmp, good);
  try {
    if (assertFile(".tmp-saf-wave3-selftest.tsx", CHECKS[0].needles).length > 0) {
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
console.log(`${LABEL} PASS — CSA/attendance/permits action mutations surface isError`);
