#!/usr/bin/env node
/**
 * GUARD — ACCT-F101: every auto-poster's pure builder must be covered by the double-entry balance test.
 *
 * THE GAP, MEASURED 2026-08-03: six builders exist across five poster services
 * (safety-fine, parts-inventory, insurance-claim-recovery, warranty, property-tax ×2) and NOT ONE had a
 * unit test. On that same day PARTS_PURCHASE_GL_POSTING_ENABLED and SAFETY_FINE_GL_POSTING_ENABLED were
 * switched ON for TRANSP/TRK/USMCA — real money started flowing through builders whose debits-equal-
 * credits property was asserted nowhere. Every one of them carried a comment saying "balanced by
 * construction". A comment is not a control.
 *
 * WHY ENUMERATING, NOT A FIXED LIST: a guard that hardcodes today's six builders goes green forever the
 * moment someone adds a seventh. This DERIVES the class from the source tree — every
 * `export function build<X>Postings` under a poster.service.ts — and requires each to be registered in
 * the balance test. Adding a poster without a balance test fails CI. That is the ratchet.
 *
 * IMPORT LINES ARE STRIPPED from the test before matching. A builder that is merely imported but never
 * registered in the BUILDERS table is never exercised; treating the import as coverage is the exact
 * fail-open that made an earlier guard (verify-invoice-posts-gl-on-issue) green on a mutated tree.
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const LABEL = "verify:poster-balance-covered";
const ACCOUNTING_DIR = "apps/backend/src/accounting";
const TEST_FILE = "apps/backend/src/accounting/__tests__/poster-balance-invariant.test.ts";

/** `export function buildSomethingPostings(` — the pure Dr/Cr builders. */
const BUILDER_RE = /export\s+function\s+(build[A-Za-z0-9_]*Postings)\s*\(/g;

/** Strip block/line comments and import statements. See header for why imports must not count. */
export function stripCommentsAndImports(src) {
  return String(src)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1")
    .replace(/^\s*import\s+[\s\S]*?from\s+["'][^"']+["'];?\s*$/gm, "");
}

/** Every builder name exported by any poster.service.ts, as {name, file}. */
export function findBuilders(posterSources) {
  const found = [];
  for (const [file, raw] of Object.entries(posterSources)) {
    if (raw == null) continue;
    const src = stripCommentsAndImports(raw);
    for (const m of src.matchAll(BUILDER_RE)) found.push({ name: m[1], file });
  }
  return found;
}

export function analyse(posterSources, testSource) {
  const problems = [];
  const builders = findBuilders(posterSources);

  if (builders.length === 0) {
    problems.push(
      `no build*Postings builders found under ${ACCOUNTING_DIR}. Either every auto-poster was deleted ` +
        `or the detection pattern rotted — both mean this guard is no longer protecting anything.`
    );
    return problems;
  }

  if (testSource == null) {
    problems.push(
      `${TEST_FILE} is missing. ${builders.length} poster builder(s) would ship with no assertion that ` +
        `debits equal credits — an unbalanced JE corrupts the trial balance and is invisible until close.`
    );
    return problems;
  }

  const body = stripCommentsAndImports(testSource);
  for (const { name, file } of builders) {
    if (!new RegExp(`\\b${name}\\b`).test(body)) {
      problems.push(
        `${file}: ${name} is not registered in ${TEST_FILE}. A poster builder with no balance test can ` +
          `emit a JE whose debits and credits differ and nothing will catch it.`
      );
    }
  }
  return problems;
}

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry === "poster.service.ts") out.push(full);
  }
  return out;
}

function readAll() {
  const sources = {};
  for (const file of walk(ACCOUNTING_DIR)) sources[file] = readFileSync(file, "utf8");
  return { sources, test: existsSync(TEST_FILE) ? readFileSync(TEST_FILE, "utf8") : null };
}

function selftest() {
  const failures = [];
  const t = (label, cond) => { if (!cond) failures.push(label); };

  const poster = "export function buildFooPostings(a,b,c,d){ return []; }";
  const poster2 = "export function buildBarPostings(a,b,c,d){ return []; }";
  const covered = "const BUILDERS = [ { fn: buildFooPostings } ];";
  const coveredBoth = "const BUILDERS = [ buildFooPostings, buildBarPostings ];";

  t("a covered builder passes",
    analyse({ "a/poster.service.ts": poster }, covered).length === 0);

  // THE REAL PRE-FIX STATE: builders exist, no test file at all.
  t("no test file FAILS",
    analyse({ "a/poster.service.ts": poster }, null).length === 1);

  t("an uncovered builder FAILS",
    analyse({ "a/poster.service.ts": poster, "b/poster.service.ts": poster2 }, covered).length === 1);

  t("all builders covered passes",
    analyse({ "a/poster.service.ts": poster, "b/poster.service.ts": poster2 }, coveredBoth).length === 0);

  // The fail-open this guard is written to avoid.
  t("an IMPORT alone does not count as coverage",
    analyse({ "a/poster.service.ts": poster },
      'import { buildFooPostings } from "../a/poster.service.js";\nconst BUILDERS = [];').length === 1);

  t("a comment mentioning the builder does not count as coverage",
    analyse({ "a/poster.service.ts": poster }, "// buildFooPostings is fine, trust me").length === 1);

  t("a commented-OUT builder is not required",
    analyse({ "a/poster.service.ts": "// export function buildGonePostings(" }, covered).length === 1);

  t("zero builders FAILS (pattern rot / mass deletion)",
    analyse({ "a/poster.service.ts": "export function somethingElse(){}" }, covered).length === 1);

  // `buildFooPostingsExtra` must NOT satisfy the requirement for `buildFooPostings` — word-boundary
  // matching, so a similarly-named helper cannot stand in for the real builder's coverage.
  t("a near-miss name is not mistaken for coverage",
    analyse({ "a/poster.service.ts": poster }, "const BUILDERS = [buildFooPostingsExtra];").length === 1);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:\n  - ${failures.join("\n  - ")}`);
    process.exit(1);
  }
}

if (process.argv.includes("--selftest")) {
  selftest();
  console.log(`${LABEL} selftest OK — 9 cases (2 pass-shapes, 7 fail-shapes incl. the real gap and the import-only fail-open)`);
  process.exit(0);
}

const { sources, test } = readAll();
const problems = analyse(sources, test);
if (problems.length) {
  console.error(`${LABEL} FAILED:\n  - ${problems.join("\n  - ")}`);
  process.exit(1);
}
console.log(
  `${LABEL} OK — ${findBuilders(sources).length} poster builder(s), every one covered by the balance test`
);
