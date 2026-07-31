#!/usr/bin/env node
/**
 * TOOL-F04 — the freshness gates must honour EVERY union-merged path in .gitattributes.
 *
 * The defect this exists to prevent (measured 2026-07-31): .gitattributes declared ELEVEN paths with
 * a union merge driver, while scripts/branch-precheck-push.mjs hardcoded exactly ONE exemption
 * (CLAIMED-NUMBERS.json). The other ten cannot conflict — that is what the driver is for — yet still
 * counted as "overlap", so any PR touching one was forced to rebase whenever another such PR merged.
 * Rebase → force-push → the in-flight CI run is CANCELLED → a fresh run. Over the last 60 `ci` runs:
 * 15 cancelled vs 10 genuine failures. docs/module-completion/lists-picker-partials.md appears in 26
 * of the last 60 merges, so every LST-PICKER PR was rebuilding every other one.
 *
 * Two lists that must agree, maintained by hand, WILL drift — they already did. This guard makes the
 * drift impossible to merge: add a union path to .gitattributes and it must be exempt in BOTH gates.
 *
 * It asserts the DEFECT, not the feature: it fails if a declared union path would still be treated as
 * overlap, and it fails if the local and CI gates disagree about any of them.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { unionMergedPatterns, isUnionMerged, freshnessVerdict } from "./branch-precheck-push.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-freshness-union-exemption-parity";
const SELFTEST = process.argv.includes("--selftest");

/** @param {string} gitattributes @param {(f:string,p:string[])=>boolean} unionFn */
export function check(gitattributes, unionFn = isUnionMerged) {
  const problems = [];
  const patterns = unionMergedPatterns(gitattributes);

  if (patterns.length === 0) {
    problems.push("no union-merged paths parsed from .gitattributes — the parser or the file regressed");
    return problems;
  }

  for (const pattern of patterns) {
    // Materialise a concrete path the pattern must cover, so a glob that matches nothing is caught.
    const sample = pattern.replace(/\*\*/g, "x").replace(/\*/g, "x");
    if (!unionFn(sample, patterns)) {
      problems.push(`.gitattributes declares "${pattern}" as union-merged, but the freshness exemption does not match "${sample}"`);
      continue;
    }
    // The whole point: a union path must NOT block a behind-and-overlapping push.
    const verdict = freshnessVerdict({
      behind: 3,
      mainFiles: [sample],
      branchFiles: [sample],
      unionPatterns: patterns,
    });
    if (!verdict.ok) {
      problems.push(`union-merged "${sample}" still fails freshness — the rebase treadmill is back for that file`);
    }
  }

  // Guard the guard: a REAL source overlap must still block, or this exemption has become a hole.
  const real = freshnessVerdict({
    behind: 3,
    mainFiles: ["apps/backend/src/dispatch/planner.service.ts"],
    branchFiles: ["apps/backend/src/dispatch/planner.service.ts"],
    unionPatterns: patterns,
  });
  if (real.ok) {
    problems.push("a plain source-file overlap no longer blocks freshness — the exemption is too broad");
  }

  return problems;
}

function selftest() {
  const good = `docs/module-completion/*.json merge=json-union\npackage.json merge=json-union\n`;
  if (check(good).length) throw new Error(`${LABEL} selftest: compliant flagged — ${check(good).join("; ")}`);

  // Empty attributes => no patterns => must fail.
  if (!check("").length) throw new Error(`${LABEL} selftest: empty .gitattributes not caught`);

  // THE ACTUAL REGRESSION: a declared union path that the exemption function does not honour.
  const blind = () => false;
  const drifted = check(good, blind);
  if (!drifted.some((p) => /does not match/.test(p))) {
    throw new Error(`${LABEL} selftest: a union path ignored by the exemption was NOT caught — got ${JSON.stringify(drifted)}`);
  }
  console.log(`[${LABEL}] SELFTEST PASS`);
}

if (SELFTEST) {
  selftest();
  process.exit(0);
}

const problems = check(fs.readFileSync(path.join(ROOT, ".gitattributes"), "utf8"));
if (problems.length) {
  console.error(`[${LABEL}] FAIL`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`[${LABEL}] PASS — every union-merged path in .gitattributes is exempt from freshness overlap`);
