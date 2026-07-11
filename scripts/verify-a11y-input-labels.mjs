#!/usr/bin/env node
// verify-a11y-input-labels (0243-g8-4)
// eslint-plugin-jsx-a11y cannot install on this repo's eslint 10 (its peer caps at eslint 9), and a
// repo-wide legacy-peer-deps would mask OTHER peer conflicts — so we enforce the input-accessible-name
// rule with the repo's own forward-only ratchet instead (complements the runtime axe audit in
// a11y-checks.yml, which catches rendered a11y issues on the pages it walks).
//
// Rule: a native <input>/<textarea> with a `placeholder` must also carry an accessible NAME —
// aria-label / aria-labelledby / id (external <label htmlFor>) / title. A placeholder is NOT an
// accessible name (it vanishes on input and many screen readers ignore it). Current violations are
// BASELINED; any NEW one (live count > baseline) fails CI. Lower the baseline as they get fixed.
// Self-test: --selftest.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "apps/frontend/src");
const BASELINE_REL = "scripts/.a11y-input-label-baseline.json";

// An opening <input .../> or <textarea ...> tag (non-greedy to the first >).
const TAG_RE = /<(input|textarea)\b[\s\S]*?\/?>/gi;
// Accepted accessible-name hints on the same tag.
const HAS_NAME = /\b(aria-label|aria-labelledby|title|id)\s*=/;

/** Count native input/textarea tags that have a placeholder but no accessible-name hint, in one source. */
export function countOffenders(source) {
  let n = 0;
  let m;
  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(source)) !== null) {
    const tag = m[0];
    if (/\bplaceholder\s*=/.test(tag) && !HAS_NAME.test(tag)) n += 1;
  }
  return n;
}

function walk(dir) {
  const out = [];
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name === "node_modules" || e.name === "__tests__") continue; out.push(...walk(abs)); }
    else if (/\.tsx$/.test(e.name) && !/\.(test|spec)\.tsx$/.test(e.name)) out.push(abs);
  }
  return out;
}

function liveCount() {
  let total = 0;
  for (const abs of walk(SRC)) total += countOffenders(fs.readFileSync(abs, "utf8"));
  return total;
}

function loadBaseline() {
  try { return Number(JSON.parse(fs.readFileSync(path.join(ROOT, BASELINE_REL), "utf8")).count) || 0; }
  catch { return 0; }
}

function run() {
  const live = liveCount();
  const baseline = loadBaseline();
  console.log(`verify:a11y-input-labels — ${live} placeholder-only inputs without an accessible name (baseline ${baseline})`);
  if (live > baseline) {
    return [
      `${live} native <input>/<textarea> with a placeholder but no accessible name (aria-label / aria-labelledby / id / title) — ${live - baseline} NEW above the baseline of ${baseline}. Add an accessible name to the new input(s). (A placeholder is not a name.)`,
    ];
  }
  if (live < baseline) {
    console.log(`  ↓ improved: lower the baseline in ${BASELINE_REL} to ${live} to tighten the ratchet.`);
  }
  return [];
}

export { run };

if (process.argv.includes("--selftest")) {
  const cases = [
    ['<input placeholder="Search" />', 1, "placeholder-only input is an offender"],
    ['<input placeholder="Search" aria-label="Search loads" />', 0, "aria-label clears it"],
    ['<input id="q" placeholder="Search" />', 0, "id (external label) clears it"],
    ['<input type="checkbox" />', 0, "no placeholder → not counted"],
    ['<textarea placeholder="Notes" />', 1, "textarea counts too"],
    ['<input placeholder="a" title="Search" />', 0, "title clears it"],
  ];
  const checks = cases.map(([src, want, name]) => [name, countOffenders(src) === want]);
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) { console.error("verify:a11y-input-labels --selftest FAIL:"); for (const [n] of failed) console.error("  ✗ " + n); process.exit(1); }
  console.log(`verify:a11y-input-labels --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const failures = run();
  if (failures.length) {
    console.error("verify:a11y-input-labels FAIL:");
    for (const f of failures) console.error("  ✗ " + f);
    process.exit(1);
  }
  console.log("verify:a11y-input-labels PASS (no new placeholder-only inputs above baseline)");
}
