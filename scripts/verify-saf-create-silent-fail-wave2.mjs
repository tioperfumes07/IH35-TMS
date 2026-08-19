#!/usr/bin/env node
/**
 * verify-saf-create-silent-fail-wave2
 * SAF-CREATE-SILENT-FAIL-WAVE2 — remaining safety create/save surfaces must
 * expose mutation.isError (CSA mitigation, archived DOT/Complaints still mounted
 * via SafetyHome, SafetySettingsForm).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-saf-create-silent-fail-wave2";
const TARGETS = [
  {
    file: "apps/frontend/src/pages/safety/CSAMitigationQueue.tsx",
    needle: "createMutation.isError",
    testid: "csa-mitigation-create-error",
  },
  {
    file: "apps/frontend/src/pages/safety/DotInspectionsPage.tsx",
    needle: "createMutation.isError",
    testid: "dot-inspection-create-error",
  },
  {
    file: "apps/frontend/src/pages/safety/ComplaintsPage.tsx",
    needle: "createMutation.isError",
    testid: "complaint-create-error",
  },
  {
    file: "apps/frontend/src/pages/safety/components/SafetySettingsForm.tsx",
    needle: "mutation.isError",
    testid: "safety-settings-save-error",
  },
];

function assertFile(rel, needle, testid) {
  const src = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
  const errors = [];
  if (!src.includes(needle)) errors.push(`${rel}: missing ${needle}`);
  if (!src.includes("userFacingApiError")) errors.push(`${rel}: missing userFacingApiError`);
  if (!src.includes(testid)) errors.push(`${rel}: missing ${testid}`);
  return errors;
}

function selftest() {
  const bad = `onClick={() => createMutation.mutate()}`;
  const good = `import { userFacingApiError } from "../../lib/api-error-message";
{createMutation.isError ? <p data-testid="csa-mitigation-create-error">{userFacingApiError(createMutation.error, "x")}</p> : null}`;
  const tmpBad = path.join(process.cwd(), ".tmp-saf-wave2-bad.tsx");
  const tmpGood = path.join(process.cwd(), ".tmp-saf-wave2-good.tsx");
  fs.writeFileSync(tmpBad, bad);
  fs.writeFileSync(tmpGood, good);
  try {
    const badErrs = assertFile(".tmp-saf-wave2-bad.tsx", "createMutation.isError", "csa-mitigation-create-error");
    const goodErrs = assertFile(".tmp-saf-wave2-good.tsx", "createMutation.isError", "csa-mitigation-create-error");
    if (badErrs.length === 0 || goodErrs.length > 0) {
      console.error(`${LABEL} SELFTEST FAIL`, { badErrs, goodErrs });
      process.exit(1);
    }
  } finally {
    fs.unlinkSync(tmpBad);
    fs.unlinkSync(tmpGood);
  }
  console.log(`${LABEL} selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const errors = [];
for (const t of TARGETS) {
  if (!fs.existsSync(path.join(process.cwd(), t.file))) {
    errors.push(`missing ${t.file}`);
    continue;
  }
  errors.push(...assertFile(t.file, t.needle, t.testid));
}
if (errors.length) {
  console.error(`${LABEL} FAIL:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — CSA/DOT/Complaints/Settings create surfaces isError`);
