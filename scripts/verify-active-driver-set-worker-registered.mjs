#!/usr/bin/env node
/**
 * dispatch-sweep-gap-25 — Active Driver Set bootstrap registration guard
 *
 * If the GAP-25 source files exist, apps/backend/src/index.ts MUST import and
 * call both:
 *   - registerActiveDriverSetRoutes(app)
 *   - initializeActiveDriverSetRecomputeWorker(app)
 *
 * Fails closed when sources exist but either call site is missing.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = process.cwd();
const INDEX = "apps/backend/src/index.ts";
const ROUTES = "apps/backend/src/integrations/samsara/active-driver-set/routes.ts";
const WORKER = "apps/backend/src/jobs/active-driver-set-recompute.ts";

const failures = [];

function fail(message) {
  failures.push(message);
}

function assertCallSite(indexSrc, symbol) {
  const importRe = new RegExp(
    String.raw`import\s*\{[^}]*\b${symbol}\b[^}]*\}\s*from\s*["'][^"']+["']`
  );
  const callRe = new RegExp(String.raw`\b${symbol}\s*\(\s*app\s*\)`);

  if (!importRe.test(indexSrc)) {
    fail(`${INDEX}: missing import of ${symbol}`);
  }
  if (!callRe.test(indexSrc)) {
    fail(`${INDEX}: missing call site ${symbol}(app)`);
  }
}

export function run(overrides = new Map()) {
  failures.length = 0;

  const read = (relativePath) =>
    overrides.has(relativePath)
      ? overrides.get(relativePath)
      : fs.readFileSync(path.join(ROOT, relativePath), "utf8");
  const exists = (relativePath) =>
    overrides.has(relativePath) || fs.existsSync(path.join(ROOT, relativePath));

  const routesExist = exists(ROUTES);
  const workerExist = exists(WORKER);

  if (!routesExist && !workerExist) {
    return failures;
  }

  if (!routesExist) {
    fail(`MISSING source (expected with worker): ${ROUTES}`);
  }
  if (!workerExist) {
    fail(`MISSING source (expected with routes): ${WORKER}`);
  }

  if (!exists(INDEX)) {
    fail(`MISSING: ${INDEX}`);
    return failures;
  }

  const indexSrc = read(INDEX);

  if (routesExist) {
    const routesSrc = read(ROUTES);
    if (!/export\s+async\s+function\s+registerActiveDriverSetRoutes/.test(routesSrc)) {
      fail(`${ROUTES}: missing export registerActiveDriverSetRoutes`);
    }
    assertCallSite(indexSrc, "registerActiveDriverSetRoutes");
  }

  if (workerExist) {
    const workerSrc = read(WORKER);
    if (!/export\s+function\s+initializeActiveDriverSetRecomputeWorker/.test(workerSrc)) {
      fail(`${WORKER}: missing export initializeActiveDriverSetRecomputeWorker`);
    }
    assertCallSite(indexSrc, "initializeActiveDriverSetRecomputeWorker");
  }

  return failures;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--selftest")) {
    // Planted-failure: empty index must fail when sources exist.
    const planted = run(new Map([[INDEX, "// selftest empty index\n"]]));
    if (planted.length === 0) {
      console.error(
        "[verify-active-driver-set-worker-registered] SELFTEST FAIL: planted empty index did not fail"
      );
      process.exit(1);
    }
    console.log(
      `[verify-active-driver-set-worker-registered] SELFTEST PASS (${planted.length} planted failures detected)`
    );
    process.exit(0);
  }

  const result = run();
  if (result.length > 0) {
    console.error("\n[verify-active-driver-set-worker-registered] FAILED:\n");
    for (const f of result) {
      console.error(`  ✗ ${f}`);
    }
    process.exit(1);
  }

  console.log("[verify-active-driver-set-worker-registered] All checks passed ✓");
  process.exit(0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
