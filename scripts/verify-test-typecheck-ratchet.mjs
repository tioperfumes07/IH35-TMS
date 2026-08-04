#!/usr/bin/env node
/**
 * PERMANENT FIX — backend TEST files are not typechecked, so a test can reference a field that
 * does not exist and nothing catches it until vitest runs in CI ~10 minutes later.
 *
 * WHY THIS EXISTS (real, measured):
 *   `tsconfig.json` excludes `apps/backend/src/**\/*.test.ts` and `apps/backend/src/**\/__tests__/**`,
 *   so `tsc -p tsconfig.json --noEmit` never sees a single one of the ~857 backend test files
 *   (proven with `tsc --listFiles | grep <a test file>` → 0 hits).
 *   Live cost on 2026-08-04: PR #4303 went red FOUR times, each time on test scaffolding, once on
 *       expect(result.overall_score)   // RelationshipScoreResult has overall_health_score
 *   which a typecheck resolves in seconds:
 *       error TS2339: Property 'overall_score' does not exist on type 'RelationshipScoreResult'.
 *
 * WHAT IT GATES: TS2339 ("Property X does not exist on type Y") in test files — the
 * referenced-something-that-does-not-exist class. There are 53 pre-existing occurrences, so this is a
 * RATCHET keyed on stable `file:property:type` identities, NOT a raw count: a NEW key fails; fixing an
 * old one is free (and prints the line to lower the baseline). It cannot be satisfied by deleting a
 * test — removing a key never fails, but the key set is compared exactly, so swapping one defect for
 * another is caught.
 *
 * Deliberately NOT gated: TS2345/TS2322 mock-vs-interface noise (155+80 occurrences) — those are
 * real but low-signal and fixing them is a separate project. Narrow gate now, widen later.
 *
 *   node scripts/verify-test-typecheck-ratchet.mjs
 *   node scripts/verify-test-typecheck-ratchet.mjs --write      # regenerate baseline
 *   node scripts/verify-test-typecheck-ratchet.mjs --selftest
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-test-typecheck-ratchet";
const TSCONFIG = "tsconfig.tests.json";
const BASELINE = path.join(ROOT, "scripts", "test-typecheck-baseline.json");
const WRITE = process.argv.includes("--write");
const SELFTEST = process.argv.includes("--selftest");

const GATED_CODE = "TS2339";
// Each alternative is explicitly grouped so the `$` anchor binds only to the filename branch.
// Un-grouped (`a|b$`) the precedence is ambiguous and CodeQL flags it (js/regex/missing-regexp-anchor)
// — correctly: a reader cannot tell whether `$` applies to the whole pattern or just the last branch.
const TEST_PATH = /(?:(?:^|\/)__tests__\/)|(?:\.test\.[cm]?tsx?$)/;

/** `file(line,col): error TS2339: Property 'x' does not exist on type 'Y'.` -> stable key */
export function parseTscLine(line) {
  const m = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.+)$/.exec(line.trim());
  if (!m) return null;
  const [, file, , , code, message] = m;
  if (code !== GATED_CODE) return null;
  if (!TEST_PATH.test(file)) return null;
  // Key on WHAT is missing and WHERE — never on line number, so unrelated edits don't churn it.
  const prop = /Property '([^']+)' does not exist on type '(.+?)'\.?$/.exec(message);
  const key = prop ? `${file}::${prop[1]}::${prop[2]}` : `${file}::${message}`;
  return { key, file, message };
}

export function diffKeys(baselineKeys, currentKeys) {
  const base = new Set(baselineKeys);
  const cur = new Set(currentKeys);
  return {
    added: [...cur].filter((k) => !base.has(k)).sort(),
    removed: [...base].filter((k) => !cur.has(k)).sort(),
  };
}

function runTsc() {
  try {
    execFileSync("npx", ["tsc", "-p", TSCONFIG, "--noEmit"], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return "";
  } catch (e) {
    // tsc exits non-zero when it reports errors — that is the expected path here.
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
}

if (SELFTEST) {
  const failures = [];

  // 1. The EXACT live defect that cost PR #4303 four CI cycles must produce a key.
  const real =
    "apps/backend/src/customers/relationship-score/__tests__/relationship-score-executes.db.test.ts(92,26): error TS2339: Property 'overall_score' does not exist on type 'RelationshipScoreResult'.";
  const parsed = parseTscLine(real);
  if (!parsed || !parsed.key.includes("overall_score")) {
    failures.push("the real #4303 defect line was not parsed into a key");
  }

  // 2. A NEW key must be reported as added (that is what fails the build).
  const d = diffKeys(["a::x::T"], ["a::x::T", "b::y::U"]);
  if (d.added.length !== 1 || d.added[0] !== "b::y::U") failures.push("new key not detected as added");

  // 3. Removing a key must NOT be an error (fixing debt is always allowed).
  const d2 = diffKeys(["a::x::T", "b::y::U"], ["a::x::T"]);
  if (d2.added.length !== 0) failures.push("removing a key wrongly counted as added");

  // 4. Non-test files must be ignored (product code is already covered by the root tsconfig).
  if (parseTscLine("apps/backend/src/foo.ts(1,1): error TS2339: Property 'a' does not exist on type 'B'."))
    failures.push("non-test file was not ignored");

  // 5. Other error codes must be ignored (mock-typing noise is out of scope by design).
  if (parseTscLine("apps/backend/src/x/__tests__/a.test.ts(1,1): error TS2345: Argument of type 'x'."))
    failures.push("non-gated error code was not ignored");

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error("  - " + f);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — real #4303 defect parsed; new key fails; removal allowed; scope correct`);
  process.exit(0);
}

if (!existsSync(path.join(ROOT, TSCONFIG))) {
  console.error(`${LABEL} FAIL — ${TSCONFIG} is missing; test files would not be typechecked at all.`);
  process.exit(1);
}

const out = runTsc();
const current = [];
for (const line of out.split(/\r?\n/)) {
  const p = parseTscLine(line);
  if (p) current.push(p.key);
}
const currentKeys = [...new Set(current)].sort();

if (WRITE) {
  writeFileSync(BASELINE, JSON.stringify({ gated_code: GATED_CODE, keys: currentKeys }, null, 2) + "\n");
  console.log(`${LABEL}: wrote baseline (${currentKeys.length} ${GATED_CODE} keys in test files)`);
  process.exit(0);
}

if (!existsSync(BASELINE)) {
  console.error(`${LABEL} FAIL — baseline missing. Run: node scripts/${LABEL}.mjs --write`);
  process.exit(1);
}
const baseline = JSON.parse(readFileSync(BASELINE, "utf8"));
const { added, removed } = diffKeys(baseline.keys ?? [], currentKeys);

if (added.length) {
  console.error(`${LABEL} FAIL — ${added.length} NEW ${GATED_CODE} in test file(s):`);
  for (const k of added) {
    const [file, prop, type] = k.split("::");
    console.error(`  - ${file}: property '${prop}' does not exist on type '${type}'`);
  }
  console.error(
    `\nYou referenced a field that does not exist. Read the type before asserting on it.\n` +
      `This is the exact class that cost PR #4303 four CI cycles.`,
  );
  process.exit(1);
}
console.log(
  `${LABEL}: OK — no NEW ${GATED_CODE} in test files (baseline ${baseline.keys.length}` +
    (removed.length ? `, ${removed.length} fixed — lower the baseline with --write` : "") +
    `)`,
);
process.exit(0);
