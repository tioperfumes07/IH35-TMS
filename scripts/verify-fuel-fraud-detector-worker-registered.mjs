#!/usr/bin/env node
/**
 * 0441-mod3-fuel-fraud-detector-cron-never-invok
 *
 * initializeFuelFraudDetectorWorker MUST be imported and called from
 * apps/backend/src/index.ts, and MUST default-OFF unless
 * ENABLE_FUEL_FRAUD_DETECTOR_WORKER=true.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = process.cwd();
const INDEX = "apps/backend/src/index.ts";
const WORKER = "apps/backend/src/jobs/fuel-fraud-detector-worker.ts";

const failures = [];

function fail(message) {
  failures.push(message);
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(ROOT, relativePath));
}

export function run() {
  failures.length = 0;

  if (!exists(WORKER)) {
    fail(`MISSING: ${WORKER}`);
    return failures;
  }
  if (!exists(INDEX)) {
    fail(`MISSING: ${INDEX}`);
    return failures;
  }

  const workerSrc = read(WORKER);
  const indexSrc = read(INDEX);

  if (!/export\s+function\s+initializeFuelFraudDetectorWorker/.test(workerSrc)) {
    fail(`${WORKER}: missing export initializeFuelFraudDetectorWorker`);
  }

  // Default OFF: require explicit === "true" (or !== "true" gate), not opt-out === "false"
  const defaultOff =
    /ENABLE_FUEL_FRAUD_DETECTOR_WORKER[\s\S]{0,120}!==\s*["']true["']/.test(workerSrc) ||
    /\(\s*process\.env\.ENABLE_FUEL_FRAUD_DETECTOR_WORKER[\s\S]{0,80}\)\s*===\s*["']true["']/.test(
      workerSrc
    );
  if (!defaultOff) {
    fail(
      `${WORKER}: missing default-OFF gate (ENABLE_FUEL_FRAUD_DETECTOR_WORKER must require "true")`
    );
  }

  const importRe =
    /import\s*\{[^}]*\binitializeFuelFraudDetectorWorker\b[^}]*\}\s*from\s*["'][^"']*fuel-fraud-detector-worker\.js["']/;
  if (!importRe.test(indexSrc)) {
    fail(`${INDEX}: missing import of initializeFuelFraudDetectorWorker`);
  }
  if (!/\binitializeFuelFraudDetectorWorker\s*\(\s*app\s*\)/.test(indexSrc)) {
    fail(`${INDEX}: missing call site initializeFuelFraudDetectorWorker(app)`);
  }

  const phantomSites = [
    "apps/backend/src/integrations/fuel/fraud-detector/rules.service.ts",
    "apps/backend/src/telematics/fuel-stop-planner.service.ts",
  ];
  for (const relPath of phantomSites) {
    if (!exists(relPath)) {
      fail(`MISSING: ${relPath}`);
      continue;
    }
    const src = read(relPath);
    const fromIdx = src.indexOf("FROM fuel.route_recommendations");
    if (fromIdx === -1) {
      fail(`${relPath}: expected FROM fuel.route_recommendations (do not drop the going-forward read)`);
      continue;
    }
    const prelude = src.slice(Math.max(0, fromIdx - 900), fromIdx);
    if (!prelude.includes("to_regclass('fuel.route_recommendations')")) {
      fail(
        `${relPath}: FROM fuel.route_recommendations must be preceded by to_regclass('fuel.route_recommendations') in the same function — table is NULL on prod (known unbuilt); unguarded query is 42P01`
      );
    }
  }

  return failures;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--selftest")) {
    const realIndex = path.join(ROOT, INDEX);
    const backup = fs.readFileSync(realIndex, "utf8");
    try {
      fs.writeFileSync(realIndex, "// selftest empty index\n", "utf8");
      const planted = run();
      if (planted.length === 0) {
        console.error(
          "[verify-fuel-fraud-detector-worker-registered] SELFTEST FAIL: planted empty index did not fail"
        );
        process.exit(1);
      }
      console.log(
        `[verify-fuel-fraud-detector-worker-registered] SELFTEST PASS (${planted.length} planted failures detected)`
      );
    } finally {
      fs.writeFileSync(realIndex, backup, "utf8");
    }
    process.exit(0);
  }

  const result = run();
  if (result.length > 0) {
    console.error("\n[verify-fuel-fraud-detector-worker-registered] FAILED:\n");
    for (const f of result) {
      console.error(`  ✗ ${f}`);
    }
    process.exit(1);
  }

  console.log("[verify-fuel-fraud-detector-worker-registered] All checks passed ✓");
  process.exit(0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
