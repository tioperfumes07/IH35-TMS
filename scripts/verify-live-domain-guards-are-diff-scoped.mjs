#!/usr/bin/env node
// GATE-SCOPE-01 (owner, via the Lead) — proves scripts/money-pr-local-gate.mjs's LIVE_DOMAIN_GUARDS
// loop runs a guard exactly when its own declared domain is touched, never merely because
// DATABASE_URL happens to be set. That `process.env.DATABASE_URL || touched` short-circuit made
// every live-domain guard run on every push for any seat with a live DB — every seat, every push —
// which is precisely the "blocks every seat regardless of their own diff" class this file's own
// comments say the LIVE_DOMAIN_GUARDS split exists to avoid. Confirmed live: verify-fuel-
// transactions-per-load (domain fuel/, integrations/, accounting/, data/alwaystrack/) blocked a
// banking-only PR (BANK-UNDO-01, #22452) that touched none of those paths.
//
// This changes WHEN a guard runs, never WHETHER it passes: a touched guard with no DATABASE_URL
// still fails closed (ROUND 29.9-B — a live money guard that cannot connect is a FAIL, never a
// skip); an untouched domain no longer runs at all, regardless of DATABASE_URL.
//
// `node scripts/verify-live-domain-guards-are-diff-scoped.mjs`              check
// `node scripts/verify-live-domain-guards-are-diff-scoped.mjs --selftest`   self-check, no repo scan
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-live-domain-guards-are-diff-scoped";
const GATE_PATH = path.join(ROOT, "scripts/money-pr-local-gate.mjs");

// verify-no-silent-db-skip.mjs sweeps every scripts/verify-*.mjs that MENTIONS "DATABASE_URL" in
// its own source text — this file's job is to detect that exact string elsewhere, so it matches
// the sweep by content alone, not by behavior. It is pure static source-text analysis of another
// script file: it never opens a database connection, never reads DATABASE_URL to decide its own
// behavior, and produces the identical PASS/FAIL result with DATABASE_URL set, unset, or empty
// (confirmed: `env -u NODE_ENV DATABASE_URL="" node scripts/verify-live-domain-guards-are-diff-
// scoped.mjs` exits 0, unchanged). No money/schema relevance to fail closed on.
export const ALLOW_OFFLINE_SKIP = "pure static source-text analysis of money-pr-local-gate.mjs; never connects to a database";

function fail(msg) {
  console.error(`${LABEL}: FAIL — ${msg}`);
  process.exit(1);
}

/**
 * Pure — takes the LIVE_DOMAIN_GUARDS loop body's source text (or the whole file) and returns the
 * list of structural problems found. A guard "can run on an untouched diff" exactly when the
 * `if (...)` gating `runNode(rel)` inside this loop still ORs in `process.env.DATABASE_URL` next
 * to `touched` — that OR is the only way a live DB alone (not the diff) can trigger a run.
 */
export function findUnscopedLiveDomainGuardRuns(source) {
  const problems = [];
  if (!source.includes("LIVE_DOMAIN_GUARDS")) {
    problems.push("LIVE_DOMAIN_GUARDS array not found — cannot verify its loop at all");
    return problems;
  }
  // The exact anti-pattern: DATABASE_URL ORed with the diff-derived `touched` flag as the
  // condition that lets a guard run. Written loosely (whitespace-tolerant) so a reformat doesn't
  // silently defeat the check.
  const ANTI_PATTERN_RE = /process\s*\.\s*env\s*\.\s*DATABASE_URL\s*\|\|\s*touched\b/;
  if (ANTI_PATTERN_RE.test(source)) {
    problems.push('found "process.env.DATABASE_URL || touched" — a live-domain guard can still run on an untouched diff purely because a live DB is set');
  }
  // The loop must gate `runNode(rel)` behind `if (touched)` alone, and fail closed (not skip) when
  // DATABASE_URL is absent for a touched domain.
  const loopMatch = source.match(/for\s*\(\s*const\s*\[\s*name\s*,\s*domainPaths\s*\]\s*of\s*LIVE_DOMAIN_GUARDS\s*\)\s*\{[\s\S]*?\n\}/);
  if (!loopMatch) {
    problems.push("could not locate the `for (const [name, domainPaths] of LIVE_DOMAIN_GUARDS)` loop body");
    return problems;
  }
  const loopBody = loopMatch[0];
  if (!/if\s*\(\s*touched\s*\)\s*\{/.test(loopBody)) {
    problems.push("the loop does not gate a touched guard's run behind `if (touched)` alone");
  }
  if (!/if\s*\(\s*!\s*process\s*\.\s*env\s*\.\s*DATABASE_URL\s*\)/.test(loopBody)) {
    problems.push("a touched guard with no DATABASE_URL is not explicitly failed closed inside the loop");
  }
  if (!/runNode\s*\(\s*rel\s*\)/.test(loopBody)) {
    problems.push("could not find the actual runNode(rel) call inside the loop — structure changed unexpectedly");
  }
  return problems;
}

function selftest() {
  const failures = [];

  const bad = `
const LIVE_DOMAIN_GUARDS = [["x", ["apps/backend/src/x/"]]];
for (const [name, domainPaths] of LIVE_DOMAIN_GUARDS) {
  const touched = changedForLiveDomains.some((f) => f.startsWith("apps/backend/src/x/"));
  if (process.env.DATABASE_URL || touched) {
    const code = runNode(rel);
  }
}
`;
  const badProblems = findUnscopedLiveDomainGuardRuns(bad);
  if (badProblems.length === 0) failures.push("findUnscopedLiveDomainGuardRuns did not flag the bad (OR-with-DATABASE_URL) fixture");

  const good = `
const LIVE_DOMAIN_GUARDS = [["x", ["apps/backend/src/x/"]]];
for (const [name, domainPaths] of LIVE_DOMAIN_GUARDS) {
  const touched = changedForLiveDomains.some((f) => f.startsWith("apps/backend/src/x/"));
  if (touched) {
    if (!process.env.DATABASE_URL) {
      process.exit(1);
    }
    const code = runNode(rel);
  }
}
`;
  const goodProblems = findUnscopedLiveDomainGuardRuns(good);
  if (goodProblems.length !== 0) failures.push(`findUnscopedLiveDomainGuardRuns wrongly flagged the good fixture: ${goodProblems.join("; ")}`);

  const noArray = `const x = 1;`;
  const noArrayProblems = findUnscopedLiveDomainGuardRuns(noArray);
  if (noArrayProblems.length === 0) failures.push("findUnscopedLiveDomainGuardRuns did not flag a file with no LIVE_DOMAIN_GUARDS array at all");

  if (!fs.existsSync(GATE_PATH)) {
    failures.push(`selftest: ${path.relative(ROOT, GATE_PATH)} does not exist`);
  } else {
    const realProblems = findUnscopedLiveDomainGuardRuns(fs.readFileSync(GATE_PATH, "utf8"));
    if (realProblems.length !== 0) failures.push(`findUnscopedLiveDomainGuardRuns flagged the real file: ${realProblems.join("; ")}`);
  }

  if (failures.length) {
    for (const f of failures) console.error(`${LABEL} --selftest: FAIL — ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS --selftest`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  if (!fs.existsSync(GATE_PATH)) fail(`${path.relative(ROOT, GATE_PATH)} does not exist`);
  const problems = findUnscopedLiveDomainGuardRuns(fs.readFileSync(GATE_PATH, "utf8"));
  if (problems.length) {
    fail(`${path.relative(ROOT, GATE_PATH)}: ${problems.join("; ")}`);
  }
  console.log(`${LABEL}: PASS — every LIVE_DOMAIN_GUARDS entry runs only when its own domain is touched; a touched guard with no DATABASE_URL fails closed, never skips.`);
}

main();
