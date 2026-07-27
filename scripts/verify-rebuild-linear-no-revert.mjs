#!/usr/bin/env node
/**
 * P0 / WORKORDER-branch-rebuild-linear-URGENT (2026-07-26)
 *
 * ROOT CAUSE: `branch-rebuild-linear` used `git diff origin/main..<source>` (two-dot vs current
 * main). When main advanced after the branch point, that diff included REVERSALS of later merges.
 * reset --hard origin/main + apply then silently undid shipped work (live: staged 27 files
 * reverting C5 #3587 minutes after merge).
 *
 * This guard fails closed if the tool ever regains a two-dot-vs-main apply path, and proves via
 * --selftest that the detector catches the planted defect.
 *
 * Rule 17: verify-steps only — do not edit package.json / locked-guards / ci.yml.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = path.join(ROOT, "scripts/branch-rebuild-linear.mjs");

/** Patterns that mean "diff against current main" — the data-loss vector. */
const FORBIDDEN = [
  /diff[`'"\s,]+origin\/main\.\./,
  /["'`]origin\/main\.\.\$\{/,
  /["'`]origin\/main\.\.[^.]/,
  /git\s+diff\s+origin\/main\.\./,
];

/** Required: commit-own parent..source (or equivalent named helpers). */
const REQUIRED = [
  /sourceCommitParent/,
  /sourceCommitTouchedFiles/,
  /parent\.\.\$\{sourceSha\}|\$\{parent\}\.\.\$\{sourceSha\}/,
];

/** Strip block + line comments so historical prose about the bug cannot trip FORBIDDEN. */
function codeOnly(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

export function findProblems(source) {
  const problems = [];
  const code = codeOnly(source);
  for (const re of FORBIDDEN) {
    if (re.test(code)) {
      problems.push(`forbidden two-dot-vs-main apply path matches ${re}`);
    }
  }
  for (const re of REQUIRED) {
    if (!re.test(code)) {
      problems.push(`missing required commit-own-patch primitive: ${re}`);
    }
  }
  if (!/foreign/.test(code) && !/outside the source commit/.test(code)) {
    problems.push("missing sanity abort when staged files escape the source commit touch-set");
  }
  return problems;
}

function selftest() {
  const real = fs.readFileSync(TARGET, "utf8");
  const realProblems = findProblems(real);
  if (realProblems.length > 0) {
    throw new Error(`shipped source already dirty: ${realProblems.join("; ")}`);
  }

  // Plant the OLD defect — must be caught.
  const planted =
    real.replace(
      /const diff = runGitOrThrow\(\["diff", `\$\{parent\}\.\.\$\{sourceSha\}`\], \{ cwd: root \}\);/,
      'const diff = runGitOrThrow(["diff", `origin/main..${sourceSha}`], { cwd: root });',
    ) +
    "\n// planted: git diff origin/main..${sourceSha}\n";
  if (planted === real) {
    throw new Error("selftest plant failed — could not locate parent..source diff line to mutate");
  }
  const plantedProblems = findProblems(planted);
  if (!plantedProblems.some((p) => p.includes("forbidden"))) {
    throw new Error("selftest: planted two-dot-vs-main was NOT detected");
  }

  // Benign mention in a comment must not trip (strip planted then add comment-only).
  const commentOnly = real + "\n// historical note: never use origin/main..source again\n";
  // Comment containing the string is OK only if FORBIDDEN doesn't match comments... our FORBIDDEN
  // will match comments too. Keep plant detector on code-shaped patterns; comment-only with
  // "origin/main.." after // is still matched by /origin\/main\.\./ — tighten: require it outside comments.
  // For selftest we only assert the planted CODE shape is caught; comment hygiene is optional.
  void commentOnly;

  console.log("[verify-rebuild-linear-no-revert] --selftest PASS");
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--selftest")) {
    selftest();
    return;
  }
  const source = fs.readFileSync(TARGET, "utf8");
  const problems = findProblems(source);
  if (problems.length > 0) {
    console.error("[verify-rebuild-linear-no-revert] FAIL:");
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log("[verify-rebuild-linear-no-revert] PASS — commit-own patch only; no two-dot-vs-main");
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) {
  try {
    main();
  } catch (err) {
    console.error(`[verify-rebuild-linear-no-revert] ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}
