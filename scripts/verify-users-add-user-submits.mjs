#!/usr/bin/env node
/**
 * verify-users-add-user-submits.mjs
 *
 * Guard for BUG-ADD-USER-INERT regression: proves the Add User submit path
 * is tested by running Users.test.tsx (6 tests covering the fix).
 *
 * Fails if:
 *   - The test file is missing
 *   - The critical test names are absent
 *   - vitest reports a failure or unhandled error
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TEST_FILE = "apps/frontend/src/pages/Users.test.tsx";
const LABEL = "verify-users-add-user-submits";

const errors = [];

// 1) Test file must exist.
if (!fs.existsSync(path.join(ROOT, TEST_FILE))) {
  errors.push(`MISSING test file: ${TEST_FILE}`);
}

// 2) Test file must contain the critical regression guards.
const testSrc = fs.existsSync(path.join(ROOT, TEST_FILE))
  ? fs.readFileSync(path.join(ROOT, TEST_FILE), "utf8")
  : "";

const required = [
  ["(d) valid set-password form fires POST", "POST must fire with valid input"],
  ["(e) any unexpected API error surfaces a visible error toast", "errors must surface, never silent"],
  ["(f) returning dispatcher warning blocks submit", "returning dispatcher must block submit"],
  ["createUserMock).toHaveBeenCalledWith", "must assert the POST payload"],
  ["failed to create user", "must assert error toast text"],
];
for (const [needle, why] of required) {
  if (!testSrc.includes(needle)) {
    errors.push(`${TEST_FILE} missing assertion: "${needle}" (${why})`);
  }
}

if (errors.length) {
  console.error(`[${LABEL}] FAIL (static checks)`);
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}

// 3) Run the tests.
try {
  execSync(
    "npx vitest run apps/frontend/src/pages/Users.test.tsx",
    { cwd: ROOT, stdio: "inherit" }
  );
} catch {
  console.error(`[${LABEL}] FAIL — vitest run failed`);
  process.exit(1);
}

console.log(`[${LABEL}] PASS — 6 Add User regression tests green`);
