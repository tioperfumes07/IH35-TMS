#!/usr/bin/env node
/**
 * CI-DIST-COVERAGE — step-order ratchet.
 *
 * `verify:accounting-autoload-coverage` checks BOTH src/ (always present) and dist/accounting
 * (compiled .js route files, produced only by `npm run build`/`build:backend`). The build-typecheck
 * job's `npm run build` step used to run ~500 lines BELOW the autoload-coverage check, so dist/
 * accounting never existed yet when the check ran — every PR in the 2026-08-11/12 session hit
 * "FAIL: dist: no .js route files found under dist/accounting" for that reason alone, unrelated to any
 * PR's actual diff, and had to be treated as a known pre-existing failure and bypassed rather than
 * fixed at the root. LIVE-REPRODUCED locally: moving dist/ aside reproduces the exact CI error message;
 * running `npm run build:backend` first makes it pass.
 *
 * INVARIANT (static — no database, runs in every CI context including fresh-DB): within
 * .github/workflows/ci.yml's build-typecheck job, a step running `build:backend` (or the bare `build`
 * script, which is byte-identical) must appear BEFORE the step running `verify:accounting-autoload-coverage`.
 *
 * Self-test: node scripts/verify-ci-dist-coverage-step-order.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";

const LABEL = "verify-ci-dist-coverage-step-order";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const TARGET = ".github/workflows/ci.yml";

function fail(msg) {
  console.error(`[${LABEL}] FAIL: ${msg}`);
  process.exit(1);
}

/**
 * Isolates the named job's step list (from `  <jobName>:` up to the next top-level `  <word>:` job
 * header or end of file) and returns the character offsets (within that slice) of the first `run: npm
 * run build:backend` (or bare `run: npm run build`) line and the first `run: npm run
 * verify:accounting-autoload-coverage` line. Either offset is -1 if not found.
 * Exported so the selftest can exercise it against inline fixtures without touching the filesystem.
 */
export function findStepOrder(yamlText, jobName) {
  const jobAnchorRe = new RegExp(String.raw`^  ${jobName}:\s*$`, "m");
  const anchorMatch = jobAnchorRe.exec(yamlText);
  if (!anchorMatch) return { ok: false, reason: `job "${jobName}" not found` };

  const rest = yamlText.slice(anchorMatch.index + anchorMatch[0].length);
  // Next top-level job header: a line starting with exactly two spaces then a bare identifier + colon,
  // at the SAME indentation as the anchor (not a deeper `steps:`/`env:` key, which indent further).
  const nextJobRe = /^  [A-Za-z][\w-]*:\s*$/m;
  const nextMatch = nextJobRe.exec(rest);
  const jobBlock = nextMatch ? rest.slice(0, nextMatch.index) : rest;

  const buildRe = /run:\s*npm run build(?::backend)?\s*$/m;
  const coverageRe = /run:\s*npm run verify:accounting-autoload-coverage\s*$/m;
  const buildMatch = buildRe.exec(jobBlock);
  const coverageMatch = coverageRe.exec(jobBlock);

  if (!coverageMatch) return { ok: true, reason: "autoload-coverage step not present in this job — nothing to order" };
  if (!buildMatch) return { ok: false, reason: "no npm run build / build:backend step found before the autoload-coverage check (or anywhere in the job)" };
  if (buildMatch.index > coverageMatch.index) {
    return { ok: false, reason: "npm run build/build:backend runs AFTER verify:accounting-autoload-coverage — dist/accounting will not exist yet" };
  }
  return { ok: true };
}

const isEntryPoint = import.meta.url === `file://${process.argv[1]}`;

if (isEntryPoint && process.argv.includes("--selftest")) {
  const good = `
jobs:
  build-typecheck:
    steps:
      - name: Install
        run: npm ci
      - name: Build backend
        run: npm run build:backend
      - name: Verify accounting autoload coverage
        run: npm run verify:accounting-autoload-coverage
  other-job:
    steps:
      - run: echo hi
`;
  const goodResult = findStepOrder(good, "build-typecheck");
  if (!goodResult.ok) fail(`selftest: known-good fixture should pass — ${goodResult.reason}`);

  const regressed = `
jobs:
  build-typecheck:
    steps:
      - name: Install
        run: npm ci
      - name: Verify accounting autoload coverage
        run: npm run verify:accounting-autoload-coverage
      - name: Build backend
        run: npm run build:backend
`;
  const regressedResult = findStepOrder(regressed, "build-typecheck");
  if (regressedResult.ok) fail("selftest: regressed fixture (build AFTER coverage check) should FAIL but passed");

  const missingBuild = `
jobs:
  build-typecheck:
    steps:
      - name: Verify accounting autoload coverage
        run: npm run verify:accounting-autoload-coverage
`;
  const missingResult = findStepOrder(missingBuild, "build-typecheck");
  if (missingResult.ok) fail("selftest: missing-build fixture should FAIL but passed");

  // Job-isolation trap: a build step correctly ordered in a DIFFERENT job must not satisfy this job's
  // requirement — proves the job-block extraction doesn't spill across job boundaries.
  const wrongJob = `
jobs:
  other-job:
    steps:
      - run: npm run build:backend
  build-typecheck:
    steps:
      - name: Verify accounting autoload coverage
        run: npm run verify:accounting-autoload-coverage
`;
  const wrongJobResult = findStepOrder(wrongJob, "build-typecheck");
  if (wrongJobResult.ok) fail("selftest: build step in a DIFFERENT job should not satisfy build-typecheck's requirement, but the guard matched across job boundaries");

  console.log(`[${LABEL}] selftest: PASS — good/regressed/missing-build/job-isolation fixtures all classify correctly`);
  process.exit(0);
}

if (isEntryPoint) {
  const filePath = path.join(ROOT, TARGET);
  if (!fs.existsSync(filePath)) fail(`${TARGET}: file not found`);
  const yamlText = fs.readFileSync(filePath, "utf8");
  const result = findStepOrder(yamlText, "build-typecheck");
  if (!result.ok) fail(`${TARGET} (job build-typecheck): ${result.reason}`);
  console.log(`[${LABEL}] PASS — build-typecheck builds dist/ before checking accounting autoload coverage`);
}
