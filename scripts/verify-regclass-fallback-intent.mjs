#!/usr/bin/env node
/**
 * GUARD — CLS-LATCH-TABLE-ABSENT-SILENT-DEGRADE (ratchet).
 *
 * A `to_regclass('schema.table')` probe asks "does this table exist yet?". The FALSE branch is where the
 * class lives: if it returns the permissive value — `false` for "is this suppressed?", an empty list, a bare
 * `return` — the feature silently degrades and nothing anywhere records that the control could not run.
 *
 * CC-3 measured the live half on prod 2026-08-07: of the distinct probe targets, 8 tables are ABSENT, and the
 * consequences ranged from harmless to serious — `notifications.suppression_rules` FAILS OPEN (every
 * suppressed recipient is mailed anyway), `pwa.driver_notifications` silently drops. The model to copy is
 * `fuel.loves_prices_daily`, which THROWS `loves_prices_daily_unavailable` and reports status "never" — an
 * honest unavailable beats a false empty.
 *
 * WHAT THIS GUARD DOES, AND DELIBERATELY DOES NOT DO.
 * It is a RATCHET, not a verdict on the existing code. Measured on tip-main: 245 probe sites across 139
 * non-test files, of which 43 declare intent within their false branch and 202 do not. **This guard does NOT
 * claim those 202 are 202 defects** — a textual window cannot tell a control path (where permissive is
 * wrong) from an optional read (where degrading quietly is fine), and the card itself carves out several
 * NON-defects. Asserting otherwise would be exactly the over-claiming that wastes a builder's day.
 *
 * So: the current per-file counts are frozen in a baseline, and the guard fails when a file gains a NEW bare
 * probe. The class cannot grow while the per-site dispositions are worked through, and every ratchet-down is
 * a real, reviewable decrease.
 *
 * NOT CLAIMED: this is static text analysis. It proves the count of undeclared false-branches per file did
 * not rise. It cannot prove any individual site is correct — that is the per-site work the card describes.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-regclass-fallback-intent";
const SCAN_ROOT = "apps/backend/src";
const BASELINE = "scripts/regclass-fallback-intent-baseline.json";

/** A false-branch "declares intent" if it throws, returns an HTTP error, or names an explicit unavailable code. */
const DECLARES_INTENT = /throw |reply\.code\(|E_[A-Z_]+|_unavailable|NOT_APPLIED|fail(?:s)?[ _-]?closed|503/;

export function scanSource(src) {
  let total = 0;
  let bare = 0;
  for (const m of src.matchAll(/to_regclass/g)) {
    total += 1;
    if (!DECLARES_INTENT.test(src.slice(m.index, m.index + 900))) bare += 1;
  }
  return { total, bare };
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(rel, out);
    else if (entry.name.endsWith(".ts") && !entry.name.includes(".test.")) out.push(rel);
  }
  return out;
}

export function measure() {
  const counts = {};
  for (const rel of walk(SCAN_ROOT)) {
    const { bare } = scanSource(fs.readFileSync(path.join(ROOT, rel), "utf8"));
    if (bare > 0) counts[rel] = bare;
  }
  return counts;
}

export function compare(current, baseline) {
  const problems = [];
  for (const [file, count] of Object.entries(current)) {
    const allowed = baseline[file] ?? 0;
    if (count > allowed) {
      problems.push(
        `${file}: ${count} to_regclass false-branch(es) with no declared intent, baseline allows ${allowed}. ` +
          `A probe whose false branch returns the permissive value degrades silently — make it throw, fail ` +
          `closed, or signal (CLS-LATCH-TABLE-ABSENT-SILENT-DEGRADE).`,
      );
    }
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const cases = [
    ["bare probe counts as undeclared", () => scanSource(`const t = await q("SELECT to_regclass('a.b')"); if (!t) return false;`).bare, 1],
    ["throwing false-branch declares intent", () => scanSource(`const t = await q("SELECT to_regclass('a.b')"); if (!t) throw new Error("x");`).bare, 0],
    ["explicit unavailable code declares intent", () => scanSource(`to_regclass('a.b') ... loves_prices_daily_unavailable`).bare, 0],
    ["no probe at all", () => scanSource(`const x = 1;`).total, 0],
    ["RATCHET — a file gaining a bare probe fails", () => compare({ "f.ts": 2 }, { "f.ts": 1 }).length, 1],
    ["RATCHET — holding at baseline passes", () => compare({ "f.ts": 1 }, { "f.ts": 1 }).length, 0],
    ["RATCHET — ratcheting DOWN passes", () => compare({ "f.ts": 0 }, { "f.ts": 3 }).length, 0],
    ["RATCHET — a brand-new file with a bare probe fails", () => compare({ "new.ts": 1 }, {}).length, 1],
  ];
  let bad = 0;
  for (const [name, run, want] of cases) {
    const got = run();
    if (got !== want) {
      console.error(`SELFTEST FAIL: ${name} — expected ${want}, got ${got}`);
      bad++;
    }
  }
  if (bad) process.exit(1);
  console.log(`${LABEL} SELFTEST PASS — ${cases.length} cases`);
  process.exit(0);
}

if (process.argv.includes("--write-baseline")) {
  fs.writeFileSync(path.join(ROOT, BASELINE), `${JSON.stringify(measure(), null, 2)}\n`);
  console.log(`${LABEL} baseline written to ${BASELINE}`);
  process.exit(0);
}

const baselinePath = path.join(ROOT, BASELINE);
if (!fs.existsSync(baselinePath)) {
  console.error(`${LABEL} FAIL — missing ${BASELINE}; refusing to pass vacuously.`);
  process.exit(1);
}
const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
const current = measure();
if (Object.keys(current).length === 0) {
  console.error(`${LABEL} FAIL — scanned ${SCAN_ROOT} and found ZERO probes; scope is wrong, refusing to pass vacuously.`);
  process.exit(1);
}
const problems = compare(current, baseline);
if (problems.length) {
  console.error(`${LABEL} FAIL — new to_regclass false-branch(es) with no declared intent:\n`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error(`\nFix: throw, fail closed, or degrade WITH a signal. Copy fuel.loves_prices_daily.\n`);
  process.exit(1);
}
const totalBare = Object.values(current).reduce((a, b) => a + b, 0);
console.log(`${LABEL} OK — ${totalBare} undeclared false-branch(es) across ${Object.keys(current).length} file(s), at or below baseline.`);
process.exit(0);
