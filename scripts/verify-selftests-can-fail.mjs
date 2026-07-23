#!/usr/bin/env node
/**
 * META-GUARD: a guard's `--selftest` must be capable of FAILING.
 *
 * WHY THIS EXISTS
 * During the 2026-07-22/23 accounting review, five guards were found whose `--selftest` could not
 * fail. The worst printed `SELFTEST PASS` **while printing its own failures** and exited 0. Another
 * had an inverted condition so it could never pass at all. Several compared two string literals
 * declared inside the script and never touched the repo, so they exited 0 against unfixed `main`.
 *
 * A selftest exists to prove the guard's assertions still BITE. One that cannot fail is worse than
 * none: it certifies a broken guard as healthy, and the next agent trusts it.
 *
 * WHAT COUNTS AS A REAL SELFTEST (either is fine):
 *   - it calls the guard's own assertion (assert.../check.../run...) — typically with a planted-bad
 *     fixture, so a broken assertion surfaces; or
 *   - it reads real repo files (read()/readFileSync) and mutates them, so the assertion is
 *     exercised against source that actually changed.
 * And it must be able to exit non-zero.
 *
 * HARD FAIL (never baselined): reporting failures and still exiting 0 — the fake-green pattern.
 *
 * RATCHET: `scripts/selftests-can-fail-known-debt.json` lists guards that predate this rule. The
 * list may only SHRINK. A NEW inert selftest fails CI. Run --write-baseline once to capture debt.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPTS = path.join(ROOT, "scripts");
const DEBT_FILE = path.join(SCRIPTS, "selftests-can-fail-known-debt.json");
const LABEL = "verify-selftests-can-fail";
const WRITE_BASELINE = process.argv.includes("--write-baseline");

/** Brace-balanced body of `function selftest(...) { ... }`, or null. */
function selftestBody(source) {
  const m = /function\s+selftest\s*\([^)]*\)\s*\{/.exec(source);
  if (!m) return null;
  let i = m.index + m[0].length;
  let depth = 1;
  while (i < source.length && depth > 0) {
    const ch = source[i];
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    i++;
  }
  return source.slice(m.index, i);
}

/** Names of functions/consts defined at the top level of this guard file. */
function declaredFunctionNames(source) {
  const names = new Set();
  for (const m of source.matchAll(/^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
  for (const m of source.matchAll(/^\s*(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(/gm)) names.add(m[1]);
  names.delete("selftest");
  return names;
}

export function classify(source) {
  if (!source.includes("--selftest")) return { hasSelftest: false };
  const body = selftestBody(source);
  if (!body) return { hasSelftest: true, inert: false, fakeGreen: false };

  // NAME-AGNOSTIC (fixed 2026-07-23): the first version only recognised assert*/check*/run*, so
  // guards whose entrypoint is scan(), evaluate(), computeFailures(), findUncastJoins() etc. were
  // reported inert even though they genuinely exercised the assertion — a false positive that
  // caused 9 needless renames in PR #3319. What actually matters is that the selftest calls the
  // guard's OWN logic, whatever it is named, so derive the names from the file itself.
  const declared = declaredFunctionNames(source);
  const callsAssertion =
    /\b(assert\w*|check\w*|run\w*)\s*\(/.test(body) ||
    [...declared].some((n) => new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\(`).test(body));
  const readsRepo = /\bread\s*\(|readFileSync\s*\(/.test(body);
  // "Can exit non-zero" includes delegating to a fail()/die()/bail() helper or throwing — not just a
  // literal process.exit(1). verify-live-audit-reproducible.mjs calls fail(errors), which exits 1;
  // an earlier version of this detector called that fake-green, which was a FALSE POSITIVE.
  const canExitNonZero =
    /process\.exit\(1\)/.test(body) ||
    /process\.exitCode\s*=\s*1/.test(body) ||
    /\b(fail|die|bail|abort)\s*\(/.test(body) ||
    /\bthrow\b/.test(body);

  // Fake-green: collects problems, prints them, then never exits non-zero.
  const collectsProblems = /(problems|failures|errors)\s*\.\s*push/.test(body);
  const fakeGreen = collectsProblems && !canExitNonZero;

  // Inert: exercises neither the guard's own logic nor real repo source.
  const inert = !callsAssertion && !readsRepo;

  return { hasSelftest: true, inert, fakeGreen };
}

function scan() {
  const inert = [];
  const fakeGreen = [];
  for (const file of fs.readdirSync(SCRIPTS).filter((f) => /^verify-.*\.mjs$/.test(f))) {
    if (file === path.basename(fileURLToPath(import.meta.url))) continue;
    const verdict = classify(fs.readFileSync(path.join(SCRIPTS, file), "utf8"));
    if (!verdict.hasSelftest) continue;
    if (verdict.fakeGreen) fakeGreen.push(file);
    else if (verdict.inert) inert.push(file);
  }
  return { inert: inert.sort(), fakeGreen: fakeGreen.sort() };
}

const { inert, fakeGreen } = scan();

if (WRITE_BASELINE) {
  fs.writeFileSync(
    DEBT_FILE,
    JSON.stringify(
      {
        note:
          "Guards whose --selftest predates verify-selftests-can-fail and cannot currently fail. " +
          "RATCHET: this list may only SHRINK. Fix one by making its selftest run the real assertion " +
          "against a planted-bad fixture (or mutated real source), then remove its line.",
        debt: inert,
      },
      null,
      2
    ) + "\n"
  );
  console.log(`${LABEL}: baseline written with ${inert.length} known-debt entr(y/ies)`);
  process.exit(0);
}

let debt = new Set();
try {
  debt = new Set(JSON.parse(fs.readFileSync(DEBT_FILE, "utf8")).debt);
} catch {
  /* no baseline → everything is new */
}

const problems = [];

// Fake-green is NEVER baselined — printing failures and exiting 0 is the exact pattern this exists for.
if (fakeGreen.length) {
  problems.push(
    `${fakeGreen.length} selftest(s) report failures but still exit 0 (fake-green) — they must process.exit(1):`,
    ...fakeGreen.map((f) => `  ${f}`)
  );
}

const newInert = inert.filter((f) => !debt.has(f));
if (newInert.length) {
  problems.push(
    `${newInert.length} NEW selftest(s) cannot fail — they neither call the guard's own assertion nor read real source, so they prove nothing:`,
    ...newInert.map((f) => `  ${f}`),
    "Fix: run the real assertion against a planted-bad fixture (or mutated real source) and process.exit(1) when it is not caught."
  );
}

const fixed = [...debt].filter((d) => !inert.includes(d));
if (fixed.length) {
  console.log(`${LABEL}: ${fixed.length} known-debt entr(y/ies) now FIXED — remove them from the baseline (the list may only shrink):`);
  for (const f of fixed) console.log(`  ✓ fixed: ${f}`);
}

if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(p);
  process.exit(1);
}

console.log(
  `${LABEL} OK — no NEW inert selftests, no fake-green. ${debt.size} pre-existing known-debt item(s) remain (tracked for burndown).`
);
