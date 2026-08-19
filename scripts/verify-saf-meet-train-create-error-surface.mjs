#!/usr/bin/env node
/**
 * verify-saf-meet-train-create-error-surface
 * SAF-MEET-TRAIN-CREATE-SILENT-FAIL — create drawers must surface createMutation.isError
 * (never a silent no-op when POST fails).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-saf-meet-train-create-error-surface";
const TARGETS = [
  "apps/frontend/src/pages/safety/SafetyMeetingsPage.tsx",
  "apps/frontend/src/pages/safety/TrainingProgramsPage.tsx",
  "apps/frontend/src/pages/safety/TrainingRecordsPage.tsx",
];

function assertSrc(src, file) {
  const errors = [];
  if (!src.includes("createMutation.isError")) {
    errors.push(`${file}: missing createMutation.isError surface`);
  }
  if (!src.includes("userFacingApiError")) {
    errors.push(`${file}: missing userFacingApiError for create failure copy`);
  }
  if (!/-create-error/.test(src) && !/create-error"/.test(src)) {
    errors.push(`${file}: missing *-create-error data-testid`);
  }
  return errors;
}

function selftest() {
  const bad = `createMutation.mutate();\n<Button loading={createMutation.isPending}>Create</Button>`;
  const good = `import { userFacingApiError } from "../../lib/api-error-message";
{createMutation.isError ? <p data-testid="safety-meeting-create-error">{userFacingApiError(createMutation.error, "fail")}</p> : null}
createMutation.mutate();`;
  const badErrs = assertSrc(bad, "bad");
  const goodErrs = assertSrc(good, "good");
  if (badErrs.length === 0 || goodErrs.length > 0) {
    console.error(`${LABEL} SELFTEST FAIL`, { badErrs, goodErrs });
    process.exit(1);
  }
  console.log(`${LABEL} selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const errors = [];
for (const rel of TARGETS) {
  const full = path.join(process.cwd(), rel);
  if (!fs.existsSync(full)) {
    errors.push(`missing ${rel}`);
    continue;
  }
  errors.push(...assertSrc(fs.readFileSync(full, "utf8"), rel));
}
if (errors.length) {
  console.error(`${LABEL} FAIL:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — meet/train create drawers surface createMutation.isError`);
