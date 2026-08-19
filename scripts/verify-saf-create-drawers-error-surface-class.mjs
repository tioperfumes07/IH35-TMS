#!/usr/bin/env node
/**
 * verify-saf-create-drawers-error-surface-class
 * SAF-CREATE-DRAWERS-ERROR-SURFACE — Permits / SafetyEvents / InternalFines create
 * paths must surface createMutation.isError (same class as meet/train #9594).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-saf-create-drawers-error-surface-class";
const TARGETS = [
  "apps/frontend/src/pages/safety/PermitsPage.tsx",
  "apps/frontend/src/pages/safety/SafetyEventsPage.tsx",
  "apps/frontend/src/pages/safety/InternalFinesPage.tsx",
];

function assertSrc(src, file) {
  const errors = [];
  if (!src.includes("createMutation.isError")) {
    errors.push(`${file}: missing createMutation.isError surface`);
  }
  if (!src.includes("userFacingApiError")) {
    errors.push(`${file}: missing userFacingApiError`);
  }
  if (!/create-error/.test(src)) {
    errors.push(`${file}: missing *-create-error data-testid`);
  }
  return errors;
}

function selftest() {
  const bad = `onClick={() => createMutation.mutate()}\n{createMutation.isPending ? "Saving" : "Save"}`;
  const good = `import { userFacingApiError } from "../../lib/api-error-message";
{createMutation.isError ? <p data-testid="permit-create-error">{userFacingApiError(createMutation.error, "fail")}</p> : null}`;
  if (assertSrc(bad, "bad").length === 0 || assertSrc(good, "good").length > 0) {
    console.error(`${LABEL} SELFTEST FAIL`, { bad: assertSrc(bad, "bad"), good: assertSrc(good, "good") });
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
console.log(`${LABEL} PASS — Permits/Events/InternalFines create surfaces isError`);
