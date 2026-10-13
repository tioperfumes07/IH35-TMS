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

/** Pure: the problems for a given routes source + test source (paths only label the finding). */
export function settlementOverrideProblems(routes, test, routesPath = ROUTES, testPath = TEST) {
  const problems = [];
  if (!/kind:\s*"immutable"/.test(routes)) {
    problems.push(`${routesPath}: must return kind "immutable" for non-P-series display_id overrides`);
  }
  if (!/settlement_number_is_server_generated/.test(routes)) {
    problems.push(`${routesPath}: must send error settlement_number_is_server_generated`);
  }
  if (!/result\.kind === "immutable"[\s\S]{0,120}reply\.code\(409\)/.test(routes)) {
    problems.push(`${routesPath}: immutable path must reply.code(409), never 404`);
  }
  if (!/SELECT display_id,/.test(routes)) {
    problems.push(`${routesPath}: SELECT must lead with display_id (REG-010/011 suite + honest found-row predicate)`);
  }
  // Test law — do not let a seat flip expectations to 404.
  if (!/expect\(response\.statusCode\)\.toBe\(409\)/.test(test)) {
    problems.push(`${testPath}: must still expect 409 (do not change the test to expect 404)`);
  }
  if (/expect\(response\.statusCode\)\.toBe\(404\)/.test(test)) {
    problems.push(`${testPath}: must not expect 404 for typed overrides`);
  }
  if (!/settlement_number_is_server_generated/.test(test)) {
    problems.push(`${testPath}: must assert settlement_number_is_server_generated`);
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const goodRoutes = `const sql = \`SELECT display_id, id FROM x\`;
    if (taken) return { kind: "immutable" };
    if (result.kind === "immutable") { return reply.code(409).send({ error: "settlement_number_is_server_generated" }); }`;
  const goodTest = `expect(response.statusCode).toBe(409); expect(body.error).toBe("settlement_number_is_server_generated");`;
  const cases = [
    ["a compliant routes + test pass", settlementOverrideProblems(goodRoutes, goodTest).length === 0],
    ["an immutable path answering 404 fails", settlementOverrideProblems(goodRoutes.replace("reply.code(409)", "reply.code(404)"), goodTest).length > 0],
    ["a routes file without the server-generated error fails", settlementOverrideProblems(goodRoutes.split("settlement_number_is_server_generated").join("not_found"), goodTest).length > 0],
    ["a SELECT not led by display_id fails", settlementOverrideProblems(goodRoutes.replace("SELECT display_id,", "SELECT id,"), goodTest).length > 0],
    ["a test flipped to expect 404 fails", settlementOverrideProblems(goodRoutes, goodTest.replace("toBe(409)", "toBe(404)")).length > 0],
  ];
  for (const [n, ok] of cases) console.log(`  ${ok ? "✓" : "✗"} ${n}`);
  const bad = cases.filter(([, ok]) => !ok).length;
  console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
  process.exit(bad ? 1 : 0);
}

const routes = readFileSync(ROUTES, "utf8");
const test = readFileSync(TEST, "utf8");
const problems = settlementOverrideProblems(routes, test);

if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — display_id override → 409 settlement_number_is_server_generated; test still expects 409`);
