#!/usr/bin/env node
// verify:damage-continuity-worker-mounted
// Guard for 0441-mod6-damage-insurance-worker-unregistered.
//
// GAP-38 / WF-027 damage-continuity worker must be explicitly bootstrapped in index.ts
// (jobs are not autoloaded). Asserts import + call site so the hourly chain/claim tick runs.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INDEX = "apps/backend/src/index.ts";
const WORKER = "apps/backend/src/jobs/damage-continuity-worker.ts";
const LABEL = "verify:damage-continuity-worker-mounted";

function read(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) {
    throw new Error(`MISSING ${rel}`);
  }
  return fs.readFileSync(abs, "utf8");
}

function assertMounted(indexSrc) {
  const failures = [];
  if (!/import\s*\{\s*initializeDamageContinuityWorker\s*\}\s*from\s*["']\.\/jobs\/damage-continuity-worker\.js["']/.test(indexSrc)) {
    failures.push("index.ts must import initializeDamageContinuityWorker from ./jobs/damage-continuity-worker.js");
  }
  if (!/initializeDamageContinuityWorker\s*\(\s*app\s*\)/.test(indexSrc)) {
    failures.push("index.ts must call initializeDamageContinuityWorker(app) in worker bootstrap");
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const good = `
import { initializeDamageContinuityWorker } from "./jobs/damage-continuity-worker.js";
initializeDamageContinuityWorker(app);
`;
  const bad = `import { initializeAnomalyDetectorWorker } from "./jobs/anomaly-detector-worker.js";`;
  const goodFailures = assertMounted(good);
  const badFailures = assertMounted(bad);
  if (goodFailures.length > 0 || badFailures.length === 0) {
    console.error(`${LABEL} --selftest FAILED`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

const failures = [];
try {
  read(WORKER);
} catch (err) {
  failures.push(String(err.message ?? err));
}

let indexSrc = "";
try {
  indexSrc = read(INDEX);
} catch (err) {
  failures.push(String(err.message ?? err));
}

failures.push(...assertMounted(indexSrc));

if (failures.length > 0) {
  console.error(`${LABEL} FAIL:`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}

console.log(`${LABEL} PASS`);
