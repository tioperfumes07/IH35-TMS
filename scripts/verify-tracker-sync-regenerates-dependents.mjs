#!/usr/bin/env node
/**
 * GUARD (ACCT-F11100 follow-up, 2026-11-09): the Program Tracker auto-refresh must regenerate, in the same
 * commit, every registered derived artifact built from the files it rewrites.
 *
 * FAILURE IT EXISTS FOR: #28631 (program-tracker-artifacts-sync.yml) moved recon.date in
 * docs/trackers/block-reconciliation-data.json to 2026-11-10 but left docs/trackers/financial-block-buildability.md
 * titled 2026-11-03. verify-derived-artifact-freshness --strict then failed required-live-load-guard on main
 * b864c6b (job 129550585017) although all 119 live guards passed.
 *
 * CHECKS (against the real files):
 *   1. the workflow runs scripts/regen-tracker-dependents.mjs AFTER `npm run reconcile:blocks` and BEFORE the
 *      landing step, writing a paths file;
 *   2. the landing step stages that paths file (`xargs ... git add ... tracker-dependents.txt`);
 *   3. trackerDependents() over docs/specs/DERIVED-ARTIFACTS.json is non-empty and every dependent has a
 *      `regenerate` command (gen-financial-buildability.mjs is one of them today).
 *
 *   node scripts/verify-tracker-sync-regenerates-dependents.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { REGISTRY_PATH, trackerDependents } from "./regen-tracker-dependents.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-tracker-sync-regenerates-dependents";
const WORKFLOW = ".github/workflows/program-tracker-artifacts-sync.yml";

export function audit(workflowText, registry) {
  const fails = [];
  const wf = String(workflowText || "");
  const iReconcile = wf.search(/run:\s*npm run reconcile:blocks/);
  const iRegen = wf.search(/run:\s*node scripts\/regen-tracker-dependents\.mjs --paths-file "\$RUNNER_TEMP\/tracker-dependents\.txt"/);
  const iLand = wf.indexOf("git push --no-verify --force");
  if (iRegen === -1) fails.push(`${WORKFLOW}: does not run scripts/regen-tracker-dependents.mjs --paths-file "$RUNNER_TEMP/tracker-dependents.txt"`);
  else {
    if (iReconcile === -1 || iRegen < iReconcile) fails.push(`${WORKFLOW}: regen-tracker-dependents must run AFTER npm run reconcile:blocks`);
    if (iLand !== -1 && iRegen > iLand) fails.push(`${WORKFLOW}: regen-tracker-dependents must run BEFORE the landing push`);
  }
  if (!/xargs -r git add -- < "\$RUNNER_TEMP\/tracker-dependents\.txt"/.test(wf)) {
    fails.push(`${WORKFLOW}: the landing step does not stage the regenerated dependents (xargs -r git add -- < "$RUNNER_TEMP/tracker-dependents.txt")`);
  }
  const deps = trackerDependents(registry);
  if (!deps.length) fails.push(`${REGISTRY_PATH}: no registered artifact is built from the tracker-sync outputs (expected gen-financial-buildability.mjs)`);
  if (!deps.some((e) => e.generator === "scripts/gen-financial-buildability.mjs")) {
    fails.push(`${REGISTRY_PATH}: scripts/gen-financial-buildability.mjs is no longer registered against block-reconciliation-data.json`);
  }
  for (const e of deps) if (!e.regenerate) fails.push(`${REGISTRY_PATH}: ${e.generator} has no "regenerate" command`);
  return fails;
}

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

if (process.argv.includes("--selftest")) {
  const wf = read(WORKFLOW);
  const reg = JSON.parse(read(REGISTRY_PATH));
  const clean = audit(wf, reg);
  if (clean.length) {
    console.error(`${LABEL} SELFTEST FAILED — real files must pass before planting:\n  - ${clean.join("\n  - ")}`);
    process.exit(1);
  }
  const clone = () => JSON.parse(JSON.stringify(reg));
  const mutations = [
    { name: "regen step removed (the #28631 shape)", expect: "does not run scripts/regen-tracker-dependents.mjs",
      run: () => audit(wf.replace(/run: node scripts\/regen-tracker-dependents\.mjs[^\n]*/, "run: echo skipped"), reg) },
    { name: "dependents not staged", expect: "does not stage the regenerated dependents",
      run: () => audit(wf.replace(/xargs -r git add -- < "\$RUNNER_TEMP\/tracker-dependents\.txt"/, "true"), reg) },
    { name: "regen moved before reconcile", expect: "must run AFTER npm run reconcile:blocks",
      run: () => audit(wf.replace(/run:\s*npm run reconcile:blocks/, "run: npm run noop").replace(/(- name: Land the refreshed)/, "        run: npm run reconcile:blocks\n      $1"), reg) },
    { name: "buildability unregistered from recon input", expect: "no longer registered",
      run: () => { const r = clone(); for (const e of r.generated) if (e.generator === "scripts/gen-financial-buildability.mjs") { e.inputs = [".block-ready/"]; e.watch = [".block-ready/"]; } return audit(wf, r); } },
    { name: "dependent without regenerate command", expect: "has no \"regenerate\" command",
      run: () => { const r = clone(); for (const e of r.generated) if (e.generator === "scripts/gen-financial-buildability.mjs") delete e.regenerate; return audit(wf, r); } },
  ];
  const missed = mutations.filter((m) => !m.run().some((f) => f.includes(m.expect))).map((m) => m.name);
  if (missed.length) {
    console.error(`${LABEL} SELFTEST FAILED — ${mutations.length - missed.length}/${mutations.length} planted defects caught; missed: ${missed.join(", ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length}/${mutations.length} planted defects caught`);
  process.exit(0);
}

const fails = audit(read(WORKFLOW), JSON.parse(read(REGISTRY_PATH)));
if (fails.length) {
  console.error(`${LABEL}: FAIL\n  - ${fails.join("\n  - ")}`);
  process.exit(1);
}
const deps = trackerDependents(JSON.parse(read(REGISTRY_PATH)));
console.log(`${LABEL}: PASS — tracker auto-refresh regenerates and stages ${deps.length} registered dependent artifact(s): ${deps.map((e) => e.generator).join(", ")}`);
