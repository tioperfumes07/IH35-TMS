#!/usr/bin/env node
/**
 * GUARD — Fuel GL scope-matched tie-out law (Rule 13 / row 673).
 *
 * FORBIDDEN: compare Relay-card-only fuel_transactions to all-sources Fuel GL and call the
 * difference a "double-post". REQUIRED framing:
 *   Fuel GL == fuel-card poster + direct-card bank fuel + other legit non-card fuel sources
 * Miscategorization (tires/tolls into Fuel) is CLS-CATEGORY-MAP-COHERENCE — not double-post.
 *
 * Self-test: node scripts/verify-fuel-gl-scope-matched-tieout.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-fuel-gl-scope-matched-tieout";
const AUDIT_LAW = "docs/audit/IH35-FULL-SYSTEM-AUDIT-SPEC.md";
const COVERAGE = "docs/audit/AUDIT-COVERAGE-LIVE.md";
const WAVE = "docs/audit/wave-queue.json";
const STUB_REPLACEMENT = "scripts/verify-fuel-gl-no-double-post.mjs";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function collectProblems(sources) {
  const problems = [];
  const { audit, coverage, wave, fuelGuard } = sources;

  if (!/scope mismatch|SCOPE MISMATCH/i.test(audit) && !/scope-matched|scope matched/i.test(audit)) {
    problems.push(`${AUDIT_LAW}: must document Fuel scope-matched tie-out (not Relay-only vs all-sources)`);
  }
  if (!/CLS-CATEGORY-MAP-COHERENCE/.test(coverage) || !/673/.test(coverage)) {
    problems.push(`${COVERAGE}: row 673 / category-map residual must remain the tires/tolls home`);
  }
  if (!/CLS-CATEGORY-MAP-COHERENCE/.test(wave)) {
    problems.push(`${WAVE}: CLS-CATEGORY-MAP-COHERENCE wave card required`);
  }
  // The former exit-0 stub must not remain a no-op.
  if (/Guard now exits 0|No interlock needed|STATUS: SUPERSEDED/.test(fuelGuard) && !/leaf-can-never-be-captured/.test(fuelGuard)) {
    problems.push(`${STUB_REPLACEMENT}: must not remain an exit-0 superseded stub`);
  }
  if (!/scope-matched|scope matched|fuel-card poster/i.test(fuelGuard)) {
    problems.push(`${STUB_REPLACEMENT}: must enforce scope-matched Fuel GL tie-out framing`);
  }
  return problems;
}

const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (IS_MAIN && process.argv.includes("--selftest")) {
  const real = {
    audit: read(AUDIT_LAW),
    coverage: read(COVERAGE),
    wave: read(WAVE),
    fuelGuard: read(STUB_REPLACEMENT),
  };
  const broken = {
    audit: "no scope",
    coverage: "no row",
    wave: "{}",
    fuelGuard: "STATUS: SUPERSEDED\nGuard now exits 0.\nconsole.log('PASS');",
  };
  if (collectProblems(broken).length === 0) {
    console.error(`${LABEL} --selftest FAIL: broken not flagged`);
    process.exit(1);
  }
  if (collectProblems(real).length > 0) {
    console.error(`${LABEL} --selftest FAIL: real flagged`, collectProblems(real));
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

if (IS_MAIN) {
  const problems = collectProblems({
    audit: read(AUDIT_LAW),
    coverage: read(COVERAGE),
    wave: read(WAVE),
    fuelGuard: read(STUB_REPLACEMENT),
  });
  if (problems.length) {
    console.error(`${LABEL}: FAIL`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS`);
}
