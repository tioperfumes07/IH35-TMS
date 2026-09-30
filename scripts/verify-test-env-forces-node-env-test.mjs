#!/usr/bin/env node
/**
 * GUARD — the backend vitest setup must FORCE NODE_ENV="test", never defer to the ambient value.
 *
 * MEASURED 2026-09-30: the owner's Mac exports NODE_ENV=production in the login shell. With the
 * old `process.env.NODE_ENV ??= "test"`, every local run inherited it, session-middleware's boot
 * assertion (IH35_TEST_AUTH_BYPASS=1 + NODE_ENV=production -> refuse to start) threw inside
 * createIntegrationApp(), and the suite reported a misleading 401-vs-400 assertion failure. The
 * actual cause never appeared in the output.
 *
 * A suite whose result depends on who is running it is not evidence.
 *
 * SELFTEST: --selftest plants the regression and requires the guard to catch it.
 */
import { readFileSync } from "node:fs";

const FILE = "apps/backend/test-helpers/setup-env.ts";

export function checkTestEnv(source) {
  const failures = [];
  if (/process\.env\.NODE_ENV\s*\?\?=/.test(source)) {
    failures.push('NODE_ENV must be FORCED to "test" (`=`), not `??=` — `??=` inherits an ambient NODE_ENV=production');
  }
  if (!/process\.env\.NODE_ENV\s*=\s*"test";/.test(source)) {
    failures.push('setup-env.ts must contain `process.env.NODE_ENV = "test";`');
  }
  return failures;
}

const NAME = "verify-test-env-forces-node-env-test";

if (process.argv.includes("--selftest")) {
  const good = readFileSync(FILE, "utf8");
  const cases = [
    ["baseline (unmodified source)", good, 0],
    ["reverts to ??=", good.replace('process.env.NODE_ENV = "test";', 'process.env.NODE_ENV ??= "test";'), 1],
    ["the line is deleted outright", good.replace('process.env.NODE_ENV = "test";', ""), 1],
  ];
  let ok = 0;
  for (const [label, src, expectMin] of cases) {
    const found = checkTestEnv(src).length;
    const pass = expectMin === 0 ? found === 0 : found >= expectMin;
    if (pass) ok += 1;
    else console.error(`  selftest MISS: ${label} -> ${found}, expected ${expectMin === 0 ? "0" : ">=1"}`);
  }
  console.log(`${NAME} selftest ${ok}/${cases.length} ${ok === cases.length ? "OK" : "FAILED"}`);
  if (ok !== cases.length) process.exit(1);
  console.log("--- live ---");
}

const failures = checkTestEnv(readFileSync(FILE, "utf8"));
if (failures.length > 0) {
  console.error(`${NAME} FAIL`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`${NAME} PASS — vitest forces NODE_ENV=test; an ambient production value cannot leak in`);
