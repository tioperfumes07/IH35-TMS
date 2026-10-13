#!/usr/bin/env node
// B2 guard: IH35_TEST_AUTH_BYPASS must be gated by NODE_ENV and have a boot assertion.
// Fails if:
//   1. session-middleware.ts does not gate IH35_TEST_AUTH_BYPASS on NODE_ENV !== "production"
//   2. session-middleware.ts does not have a boot assertion that throws when both are set
import fs from "fs";
import path from "path";

const LABEL = "verify-b2-session-bypass-node-env-gate";
const FILE = path.join(process.cwd(), "apps/backend/src/auth/session-middleware.ts");

/** Pure: the failures for session-middleware.ts's source. */
export function check(src) {
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
  return failures;
}

const src = fs.readFileSync(FILE, "utf8");

if (process.argv.includes("--selftest")) {
  const good = [
    "export function registerSessionMiddleware(app) {",
    "  if (process.env.IH35_TEST_AUTH_BYPASS === '1' && process.env.NODE_ENV === 'production') throw new Error('bypass in production');",
    "  const bypass = process.env.IH35_TEST_AUTH_BYPASS === '1' && process.env.NODE_ENV !== 'production';",
    "}",
  ].join("\n");
  const cases = [
    ["the real session-middleware.ts passes", check(src).length === 0],
    ["a planted gated bypass with a boot assertion passes", check(good).length === 0],
    ["a bypass with no NODE_ENV gate fails", check(good.replace("&& process.env.NODE_ENV !== 'production'", "")).some((f) => f.includes("not gated"))],
    ["no boot assertion fails", check(good.replace(/throw new Error\([^)]*\);/, "")).some((f) => f.includes("no boot assertion"))],
  ];
  for (const [n, p] of cases) console.log(`  ${p ? "✓" : "✗"} ${n}`);
  const bad = cases.filter(([, p]) => !p).length;
  console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
  process.exit(bad ? 1 : 0);
}

const failures = check(src);
if (failures.length > 0) {
  console.error(`${LABEL}: FAIL`);
  for (const f of failures) console.error("  ✗ " + f);
  process.exit(1);
}

console.log(`${LABEL}: PASS — IH35_TEST_AUTH_BYPASS gated by NODE_ENV, boot assertion present`);
