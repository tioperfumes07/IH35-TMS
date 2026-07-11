#!/usr/bin/env node
// verify-guard-wired (G3, LINKAGE-LAW Clause 7)
// An unwired guard never runs — a fake green (verify:factoring-treatment existed but ran in no chain
// until #2309). This asserts every scripts/verify-*.mjs is either WIRED (referenced by
// verify-pre-commit.mjs / a verify-steps step / a workflow / a package.json script) or explicitly listed
// in scripts/.guard-exempt.json with a reason. A NEW guard that is neither wired nor exempted fails CI.
//
// The 173 pre-existing unwired guards are BASELINED in .guard-exempt.json (so today stays green); each
// should be wired or justified individually. Self-test: node scripts/verify-guard-wired.mjs --selftest
// LINKAGE: N/A (enforcement infra). Additive only.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPTS = path.join(ROOT, "scripts");
const EXEMPT_REL = "scripts/.guard-exempt.json";

function readIf(rel) { try { return fs.readFileSync(path.join(ROOT, rel), "utf8"); } catch { return ""; } }

/** Build the corpus of files that could WIRE a guard: verify-pre-commit + verify-steps + workflows + package.json. */
function wiredCorpus() {
  let corpus = readIf("scripts/verify-pre-commit.mjs") + readIf("package.json");
  const stepsDir = path.join(SCRIPTS, "verify-steps");
  if (fs.existsSync(stepsDir)) for (const f of fs.readdirSync(stepsDir)) corpus += readIf(path.join("scripts/verify-steps", f));
  const wf = path.join(ROOT, ".github/workflows");
  if (fs.existsSync(wf)) for (const f of fs.readdirSync(wf)) corpus += readIf(path.join(".github/workflows", f));
  return corpus;
}

export function computeUnwired() {
  const guards = fs.readdirSync(SCRIPTS).filter((f) => /^verify-.*\.mjs$/.test(f));
  const corpus = wiredCorpus();
  let exempt = {};
  try { exempt = JSON.parse(readIf(EXEMPT_REL)); } catch { exempt = {}; }
  const exemptSet = new Set(Object.keys(exempt).filter((k) => !k.startsWith("_")));
  const wired = [], unexempted = [];
  for (const g of guards) {
    if (corpus.includes(g)) wired.push(g);
    else if (exemptSet.has(g)) { /* exempted */ }
    else unexempted.push(g);
  }
  return { total: guards.length, wired: wired.length, exempted: exemptSet.size, unexempted };
}

function run() {
  const { total, wired, exempted, unexempted } = computeUnwired();
  console.log(`verify:guard-wired — ${total} guards: ${wired} wired, ${exempted} baseline-exempt, ${unexempted.length} unaccounted`);
  if (unexempted.length) {
    return unexempted.map((g) => `${g}: neither wired (verify-pre-commit/verify-steps/workflow/package.json) nor in ${EXEMPT_REL}`);
  }
  return [];
}

export { run };

if (process.argv.includes("--selftest")) {
  // pure-logic selftest against synthetic inputs
  const guards = ["verify-a.mjs", "verify-b.mjs", "verify-c.mjs"];
  const corpus = "npm run verify:a via verify-a.mjs here";
  const exempt = new Set(["verify-b.mjs"]);
  const unexempted = guards.filter((g) => !corpus.includes(g) && !exempt.has(g));
  const checks = [
    ["orphan (verify-c) is flagged", unexempted.includes("verify-c.mjs")],
    ["wired (verify-a) not flagged", !unexempted.includes("verify-a.mjs")],
    ["exempt (verify-b) not flagged", !unexempted.includes("verify-b.mjs")],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) { console.error("verify:guard-wired --selftest FAIL:"); for (const [n] of failed) console.error("  ✗ " + n); process.exit(1); }
  console.log(`verify:guard-wired --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const failures = run();
  if (failures.length) {
    console.error("verify:guard-wired FAIL — a guard is neither wired nor exempted:");
    for (const f of failures) console.error("  ✗ " + f);
    process.exit(1);
  }
  console.log("verify:guard-wired PASS (every verify-*.mjs is wired or baseline-exempt)");
}
