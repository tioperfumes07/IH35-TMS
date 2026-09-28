#!/usr/bin/env node
// B2 guard: IH35_TEST_AUTH_BYPASS must be gated by NODE_ENV and have a boot assertion.
// Fails if:
//   1. session-middleware.ts does not gate IH35_TEST_AUTH_BYPASS on NODE_ENV !== "production"
//   2. session-middleware.ts does not have a boot assertion that throws when both are set
import fs from "fs";
import path from "path";

const FILE = path.join(process.cwd(), "apps/backend/src/auth/session-middleware.ts");
const src = fs.readFileSync(FILE, "utf8");

const failures = [];

// Check 1: NODE_ENV gate on the bypass
const hasNodeEnvGate = /IH35_TEST_AUTH_BYPASS\s*===\s*["']1["']\s*&&\s*process\.env\.NODE_ENV\s*!==\s*["']production["']/.test(src) ||
  /process\.env\.NODE_ENV\s*!==\s*["']production["']\s*&&\s*process\.env\.IH35_TEST_AUTH_BYPASS\s*===\s*["']1["']/.test(src);
if (!hasNodeEnvGate) {
  failures.push(
    "session-middleware.ts: IH35_TEST_AUTH_BYPASS is not gated by NODE_ENV !== 'production' — " +
    "the bypass could be enabled in production by setting the env var."
  );
}

// Check 2: boot assertion that throws when both are set
const hasBootAssertion = /throw\s+new\s+Error\s*\(/.test(src) &&
  /IH35_TEST_AUTH_BYPASS/.test(src) &&
  /production/i.test(src) &&
  /registerSessionMiddleware/.test(src);
if (!hasBootAssertion) {
  failures.push(
    "session-middleware.ts: no boot assertion that throws when IH35_TEST_AUTH_BYPASS=1 and NODE_ENV=production — " +
    "the server should refuse to start in this state."
  );
}

if (failures.length > 0) {
  console.error("verify-b2-session-bypass-node-env-gate: FAIL");
  for (const f of failures) console.error("  ✗ " + f);
  process.exit(1);
}

console.log("verify-b2-session-bypass-node-env-gate: PASS — IH35_TEST_AUTH_BYPASS gated by NODE_ENV, boot assertion present");
