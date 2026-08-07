#!/usr/bin/env node
/**
 * Run the CI verify-STEP set locally, before pushing.
 *
 * WHY THIS EXISTS: `npm run verify:static` only covers guards named directly in a workflow. The steps
 * under scripts/verify-steps/ are executed by build-typecheck via verify:pre-commit (1,400+ of them),
 * and several of them are NOT in verify:static's set. That gap is not theoretical — it let four
 * separate pushes reach CI red on failures that were fully reproducible locally:
 * verify-no-guard-hotfile-thrash, verify-no-uuid-label-rendering, verify-company-membership-assert and
 * verify-entity-link-adoption. Every one cost a full CI cycle to discover something a local run would
 * have printed in seconds.
 *
 * `npm run verify:local-ci` reproduces build-typecheck exactly, but it provisions a throwaway Postgres
 * and takes 6-10 minutes, which is too slow to run before every push. This runs the same STEP files
 * with no database, classifying each outcome:
 *
 *   FAIL     — a real, reproducible failure. CI will fail on this. Fix before pushing.
 *   SKIP-DB  — the step needs a database (ECONNREFUSED / DATABASE_URL). CI has one; we do not.
 *              Reported, never counted as a pass, so the gap stays visible.
 *   PASS
 *
 * Exit 1 if anything is FAIL. Usage: node scripts/precheck-verify-steps.mjs [--filter <substr>]
 */
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const ROOT = process.cwd();
const STEPS = join(ROOT, "scripts/verify-steps");
const filterIdx = process.argv.indexOf("--filter");
const filter = filterIdx > -1 ? process.argv[filterIdx + 1] : null;

const SKIP_SIGNS = /ECONNREFUSED|DATABASE_URL|connect timeout|could not connect|password authentication|docker|verify:db:start|orbstack|daemon is running/i;

const files = readdirSync(STEPS)
  .filter((f) => /^\d+.*\.mjs$/.test(f))
  .filter((f) => !filter || f.includes(filter))
  .sort();

// Each step runs in its OWN child process. Two reasons, both learned the hard way:
//  1. Steps export { name, run(ctx) } and are driven by _runner.mjs — merely importing the FILE does
//     nothing. An earlier version of this script spawned the files and "passed" 1,400 no-ops, which is
//     precisely the vacuous-control failure it exists to prevent. The child imports and CALLS run().
//  2. Some steps call ctx.fail(), which is process.exit(). In-process that kills the whole sweep at the
//     first DB/docker step. A child contains it.
const CHILD = `
import { pathToFileURL } from "node:url";
import { createVerifyPrecommitContext } from "${join(STEPS, "_context.mjs").replace(/\\/g, "/")}";
const mod = await import(pathToFileURL(process.argv[1]).href);
const step = mod.default ?? mod;
if (typeof step?.run !== "function") { console.error("NO_RUN_EXPORT"); process.exit(3); }
const ctx = createVerifyPrecommitContext(process.cwd());
const status = await step.run(ctx);
process.exit(typeof status === "number" ? status : 0);
`;

let pass = 0;
const failed = [];
const skipped = [];

for (const f of files) {
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", CHILD, join(STEPS, f)], {
    cwd: ROOT, encoding: "utf8", timeout: 180_000,
    env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL || "postgres://x@127.0.0.1:59999/x" },
  });
  const out = `${r.stdout || ""}${r.stderr || ""}`;
  if (r.status === 0) { pass++; continue; }
  if (r.status === 3) { skipped.push(`${f} (no run() export)`); continue; }
  if (SKIP_SIGNS.test(out)) { skipped.push(`${f} (needs DB/docker)`); continue; }
  const line = out.split("\n").filter((l) => /FAIL|✗|Error|error/i.test(l)).slice(0, 2).join(" | ").slice(0, 220);
  failed.push({ f, line: line || `exit ${r.status}` });
}

console.log(`precheck-verify-steps: ${files.length} step(s) — ${pass} pass, ${failed.length} FAIL, ${skipped.length} skipped (DB/docker or no run())`);
if (failed.length) {
  console.error(`\nCI WILL FAIL on these — fix before pushing:`);
  for (const { f, line } of failed) console.error(`  ✗ ${f}\n      ${line}`);
  process.exit(1);
}
console.log("precheck-verify-steps: OK — no locally-reproducible verify-step failures.");
