#!/usr/bin/env node
// verify-guard-wired (G3, LINKAGE-LAW Clause 7) — B-D2 coverage-of-coverage
// An unwired guard never runs — a fake green. B-A1 shipped verify-banking-empty-state-entity-aware
// in package.json only; locked-guards/ci never ran it. This asserts every scripts/verify-*.mjs is
// FULLY WIRED (2026-07-17 thrash fix):
//   Guard is actually executed in CI — via .github/workflows/*.yml (npm run / node scripts/…)
//   OR via scripts/verify-steps/* when ci.yml runs verify:pre-commit.
//   package.json script is OPTIONAL (local convenience only).
// OR explicitly listed in scripts/.guard-exempt.json with a reviewed reason.
//
// NEW GUARDS: add scripts/verify-X.mjs + scripts/verify-steps/NNN-verify-X.mjs ONLY.
// Do NOT edit package.json / locked-guards.yml / ci.yml — that is the shared-file thrash.
//
// package.json-only = NOT fully wired (fails unless exempt).
// CI-only (no package.json) = fully wired.
//
// Pre-existing partials are BASELINED in .guard-exempt.json; any NEW partial/orphan fails CI.
// Self-test: node scripts/verify-guard-wired.mjs --selftest
// LINKAGE: N/A (enforcement infra). Additive only.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPTS = path.join(ROOT, "scripts");
const EXEMPT_REL = "scripts/.guard-exempt.json";
const WF_DIR = path.join(ROOT, ".github/workflows");
const STEPS_DIR = path.join(SCRIPTS, "verify-steps");

function readIf(rel) {
  try {
    return fs.readFileSync(path.join(ROOT, rel), "utf8");
  } catch {
    return "";
  }
}

function listGuards() {
  return fs.readdirSync(SCRIPTS).filter((f) => /^verify-.*\.mjs$/.test(f)).sort();
}

function loadExempt() {
  let exempt = {};
  try {
    exempt = JSON.parse(readIf(EXEMPT_REL));
  } catch {
    exempt = {};
  }
  return new Set(Object.keys(exempt).filter((k) => !k.startsWith("_")));
}

/** Map each guard file → package.json script names that invoke it. */
function packageScriptsByGuard(guards) {
  let pkg = {};
  try {
    pkg = JSON.parse(readIf("package.json"));
  } catch {
    pkg = {};
  }
  const scripts = pkg.scripts && typeof pkg.scripts === "object" ? pkg.scripts : {};
  const map = new Map();
  for (const g of guards) map.set(g, []);
  for (const [name, cmd] of Object.entries(scripts)) {
    if (typeof cmd !== "string") continue;
    for (const g of guards) {
      if (cmd.includes(g)) map.get(g).push(name);
    }
  }
  return map;
}

function workflowCorpus() {
  if (!fs.existsSync(WF_DIR)) return "";
  let corpus = "";
  for (const f of fs.readdirSync(WF_DIR)) {
    if (!/\.ya?ml$/i.test(f)) continue;
    corpus += readIf(path.join(".github/workflows", f)) + "\n";
  }
  return corpus;
}

function verifyStepsCorpus() {
  if (!fs.existsSync(STEPS_DIR)) return "";
  let corpus = "";
  for (const f of fs.readdirSync(STEPS_DIR)) {
    if (!f.endsWith(".mjs") || f.startsWith("_")) continue;
    corpus += readIf(path.join("scripts/verify-steps", f)) + "\n";
  }
  return corpus;
}

function ciRunsPreCommit(wfCorpus) {
  return /\bnpm run verify:pre-commit\b/.test(wfCorpus) || wfCorpus.includes("verify-pre-commit.mjs");
}

/**
 * True when CI will execute this guard:
 * - workflow mentions the .mjs path, OR
 * - workflow runs an npm script that points at it, OR
 * - it is imported/referenced from verify-steps AND ci.yml runs verify:pre-commit
 */
function isExecutedInCi(guard, npmNames, wfCorpus, stepsCorpus, preCommitInCi) {
  if (wfCorpus.includes(guard)) return true;
  for (const name of npmNames) {
    // npm run verify:foo  /  run: npm run verify:foo
    if (new RegExp(String.raw`\bnpm run ${escapeRegExp(name)}\b`).test(wfCorpus)) return true;
  }
  if (preCommitInCi && stepsCorpus.includes(guard)) return true;
  return false;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Classify every guard. Returns { fullyWired, pkgOnly, wfOnly, orphan, exempted }.
 * Unaccounted = pkgOnly + wfOnly + orphan (anything not fullyWired and not exempt).
 */
export function classifyGuards() {
  const guards = listGuards();
  const pkgMap = packageScriptsByGuard(guards);
  const wfCorpus = workflowCorpus();
  const stepsCorpus = verifyStepsCorpus();
  const preCommitInCi = ciRunsPreCommit(wfCorpus);
  const exemptSet = loadExempt();

  const fullyWired = [];
  const pkgOnly = [];
  const wfOnly = [];
  const orphan = [];
  const exempted = [];

  for (const g of guards) {
    const npmNames = pkgMap.get(g) || [];
    const inPkg = npmNames.length > 0;
    const inCi = isExecutedInCi(g, npmNames, wfCorpus, stepsCorpus, preCommitInCi);

    // Thrash fix: CI execution alone is enough. package.json is optional.
    if (inCi) {
      fullyWired.push(g);
      continue;
    }
    if (exemptSet.has(g)) {
      exempted.push(g);
      continue;
    }
    if (inPkg && !inCi) pkgOnly.push(g);
    else orphan.push(g);
    // wfOnly bucket retained in return shape but stays empty under new rule
  }

  return {
    total: guards.length,
    fullyWired,
    pkgOnly,
    wfOnly,
    orphan,
    exempted,
    unaccounted: [...pkgOnly, ...wfOnly, ...orphan],
  };
}

/** @deprecated use classifyGuards — kept for verify-steps import compatibility shape */
export function computeUnwired() {
  const c = classifyGuards();
  return {
    total: c.total,
    wired: c.fullyWired.length,
    exempted: c.exempted.length,
    unexempted: c.unaccounted,
  };
}

function run() {
  const c = classifyGuards();
  console.log(
    `verify:guard-wired — ${c.total} guards: ${c.fullyWired.length} fully-wired (CI via workflow or verify-steps; package.json optional), ` +
      `${c.exempted.length} exempt, ${c.unaccounted.length} unaccounted ` +
      `(pkg-only=${c.pkgOnly.length}, wf-only=${c.wfOnly.length}, orphan=${c.orphan.length})`,
  );
  if (!c.unaccounted.length) return [];

  const failures = [];
  for (const g of c.pkgOnly) {
    failures.push(
      `${g}: package.json-only — not executed by any CI workflow (or verify-steps via verify:pre-commit). ` +
        `Wire through a claimed verify-step, or add to ${EXEMPT_REL} with a reviewed reason.`,
    );
  }
  // wf-only no longer fails — CI execution alone is fully wired (2026-07-17).
  for (const g of c.orphan) {
    failures.push(
      `${g}: orphan — neither package.json nor CI. Wire through a claimed verify-step, or add to ${EXEMPT_REL} with a reviewed reason.`,
    );
  }
  return failures;
}

export { run };

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain && process.argv.includes("--selftest")) {
  // Synthetic classification logic (mirrors isExecutedInCi; package.json optional).
  const cases = [
    {
      name: "fully-wired (pkg+wf npm run)",
      inPkg: true,
      npmNames: ["verify:a"],
      guard: "verify-a.mjs",
      wf: "run: npm run verify:a\n",
      steps: "",
      preCommit: false,
      exempt: false,
      want: "fully",
    },
    {
      name: "fully-wired (pkg + verify-steps via pre-commit)",
      inPkg: true,
      npmNames: ["verify:b"],
      guard: "verify-b.mjs",
      wf: "run: npm run verify:pre-commit\n",
      steps: 'import "../verify-b.mjs"',
      preCommit: true,
      exempt: false,
      want: "fully",
    },
    {
      name: "pkg-only is NOT fully wired",
      inPkg: true,
      npmNames: ["verify:c"],
      guard: "verify-c.mjs",
      wf: "",
      steps: "",
      preCommit: false,
      exempt: false,
      want: "pkg-only",
    },
    {
      name: "CI-only (node in workflow) IS fully wired",
      inPkg: false,
      npmNames: [],
      guard: "verify-d.mjs",
      wf: "run: node scripts/verify-d.mjs\n",
      steps: "",
      preCommit: false,
      exempt: false,
      want: "fully",
    },
    {
      name: "steps-only (no package.json) IS fully wired",
      inPkg: false,
      npmNames: [],
      guard: "verify-g.mjs",
      wf: "run: npm run verify:pre-commit\n",
      steps: 'import "../verify-g.mjs"',
      preCommit: true,
      exempt: false,
      want: "fully",
    },
    {
      name: "exempt pkg-only passes",
      inPkg: true,
      npmNames: ["verify:e"],
      guard: "verify-e.mjs",
      wf: "",
      steps: "",
      preCommit: false,
      exempt: true,
      want: "exempt",
    },
    {
      name: "orphan flagged",
      inPkg: false,
      npmNames: [],
      guard: "verify-f.mjs",
      wf: "",
      steps: "",
      preCommit: false,
      exempt: false,
      want: "orphan",
    },
  ];

  const checks = [];
  for (const c of cases) {
    const inCi = isExecutedInCi(c.guard, c.npmNames, c.wf, c.steps, c.preCommit);
    let got;
    if (inCi) got = "fully";
    else if (c.exempt) got = "exempt";
    else if (c.inPkg && !inCi) got = "pkg-only";
    else got = "orphan";
    checks.push([c.name, got === c.want]);
  }

  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error("verify:guard-wired --selftest FAIL:");
    for (const [n] of failed) console.error("  ✗ " + n);
    process.exit(1);
  }
  console.log(`verify:guard-wired --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

if (isMain) {
  const failures = run();
  if (failures.length) {
    console.error("verify:guard-wired FAIL — guard is not fully wired (must run in CI via workflow or verify-steps) and not exempted:");
    for (const f of failures) console.error("  ✗ " + f);
    process.exit(1);
  }
  console.log("verify:guard-wired PASS (every verify-*.mjs runs in CI via workflow/verify-steps, or is baseline-exempt)");
}
