#!/usr/bin/env node
/**
 * ROUND 155.1.b — REG-010/011: a typed settlement display_id override that is NOT our
 * editable P-series must answer HTTP 409 settlement_number_is_server_generated.
 * Never 404 (that lies "settlement missing" when the number is taken/immutable).
 * Never rewrite the vitest to expect 404.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlement-display-id-override-is-409";
const ROUTES = join(ROOT, "apps/backend/src/driver-finance/settlements.routes.ts");
const TEST = join(ROOT, "apps/backend/src/driver-finance/__tests__/settlement-number-immutable.test.ts");

const routes = readFileSync(ROUTES, "utf8");
const test = readFileSync(TEST, "utf8");
const problems = [];

if (!/kind:\s*"immutable"/.test(routes)) {
  problems.push(`${ROUTES}: must return kind "immutable" for non-P-series display_id overrides`);
}
if (!/settlement_number_is_server_generated/.test(routes)) {
  problems.push(`${ROUTES}: must send error settlement_number_is_server_generated`);
}
if (!/result\.kind === "immutable"[\s\S]{0,120}reply\.code\(409\)/.test(routes)) {
  problems.push(`${ROUTES}: immutable path must reply.code(409), never 404`);
}
if (!/SELECT display_id,/.test(routes)) {
  problems.push(`${ROUTES}: SELECT must lead with display_id (REG-010/011 suite + honest found-row predicate)`);
}
// Test law — do not let a seat flip expectations to 404.
if (!/expect\(response\.statusCode\)\.toBe\(409\)/.test(test)) {
  problems.push(`${TEST}: must still expect 409 (do not change the test to expect 404)`);
}
if (/expect\(response\.statusCode\)\.toBe\(404\)/.test(test)) {
  problems.push(`${TEST}: must not expect 404 for typed overrides`);
}
if (!/settlement_number_is_server_generated/.test(test)) {
  problems.push(`${TEST}: must assert settlement_number_is_server_generated`);
}

if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — display_id override → 409 settlement_number_is_server_generated; test still expects 409`);
