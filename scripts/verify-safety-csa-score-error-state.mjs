#!/usr/bin/env node
/**
 * GUARD: safety CSAScore.tsx's currentQuery (FMCSA CSA BASIC tiles) and trendsQuery (per-tile
 * sparkline history) must render a real error state on failure, never let a failed fetch
 * masquerade as "no CSA data yet" (currentQuery) or "no trend yet" (trendsQuery).
 *
 * ROOT CAUSE this freezes shut: neither query ever referenced .isError, while the SAME file
 * already used the .isError pattern on pullMutation (the "Check public FMCSA source" button) —
 * just never applied it to the two GET queries that actually feed the rendered tiles/sparklines.
 * A failed currentQuery produced tiles = [], rendering a zero-tile grid on this DOT/FMCSA
 * compliance dashboard — visually indistinguishable from a carrier with a genuinely clean CSA
 * record. A failed trendsQuery produced an empty sparkline indistinguishable from "no history".
 *
 * Static-only (text-pattern) check against the real component file:
 *   1. currentQuery.isError gates a ListErrorState render as the first arm of a ternary, with the
 *      tiles grid as the else-arm — window sizes measured directly against the real file
 *      (33 / 216 actual chars) with headroom.
 *   2. trendsQuery.isError gates a distinct "Trend unavailable" message as the first arm of a
 *      ternary, with the existing <Sparkline> render as the else-arm — window sizes measured
 *      directly against the real file (90 / 57 actual chars) with headroom.
 *
 * Run:  node scripts/verify-safety-csa-score-error-state.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE_PATH = path.join(root, "apps/frontend/src/pages/safety/CSAScore.tsx");
const LABEL = "verify-safety-csa-score-error-state";

const CURRENT_GATE_RE =
  /currentQuery\.isError\s*\?\s*\([\s\S]{0,300}<ListErrorState[\s\S]{0,300}\)\s*:\s*\(/;
const TRENDS_GATE_RE =
  /trendsQuery\.isError\s*\?\s*\([\s\S]{0,200}Trend unavailable[\s\S]{0,200}\)\s*:\s*\(/;

export function checkCsaScoreErrorState(src) {
  const problems = [];

  if (!/currentQuery\.isError/.test(src)) {
    problems.push(
      "currentQuery.isError is never referenced — a failed CSA BASIC fetch cannot be distinguished from a real clean record (zero tiles)"
    );
  } else if (!CURRENT_GATE_RE.test(src)) {
    problems.push(
      "currentQuery.isError does not gate a ListErrorState render as the first arm of a ternary ahead of the tiles grid — a failed fetch could still render an empty tile grid"
    );
  }

  if (!/trendsQuery\.isError/.test(src)) {
    problems.push(
      "trendsQuery.isError is never referenced — a failed trend fetch cannot be distinguished from a real 'no trend yet' sparkline"
    );
  } else if (!TRENDS_GATE_RE.test(src)) {
    problems.push(
      "trendsQuery.isError does not gate a distinct 'Trend unavailable' render ahead of the existing Sparkline — a failed fetch could still render an empty/blank sparkline"
    );
  }

  return problems;
}

if (process.argv.includes("--selftest")) {
  const failures = [];

  const bad = `
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {tiles.map((tile) => (
        <div key={tile.basic_category}>
          <div className="mt-2 rounded-sm bg-slate-50 p-1 text-slate-600">
            <Sparkline points={sparklinePoints} />
          </div>
        </div>
      ))}
    </div>
  `;
  const badProblems = checkCsaScoreErrorState(bad);
  if (badProblems.length !== 2) {
    failures.push(
      `the real pre-fix defect verbatim expected 2 problems, got ${badProblems.length}: ${badProblems.join("; ")}`
    );
  }

  const good = fs.readFileSync(FILE_PATH, "utf8");
  const goodProblems = checkCsaScoreErrorState(good);
  if (goodProblems.length !== 0) {
    failures.push(`the real fixed file was flagged: ${goodProblems.join("; ")}`);
  }

  // Partial regression: isError referenced (e.g. a stray comment) but no real ternary gate for
  // either query.
  const partial = `
    // currentQuery.isError and trendsQuery.isError are handled upstream, trust me
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {tiles.map((tile) => (
        <div key={tile.basic_category}>
          <div className="mt-2 rounded-sm bg-slate-50 p-1 text-slate-600">
            <Sparkline points={sparklinePoints} />
          </div>
        </div>
      ))}
    </div>
  `;
  const partialProblems = checkCsaScoreErrorState(partial);
  if (partialProblems.length !== 2) {
    failures.push(
      `a partial regression (isError mentioned but no real ternary gate on either query) expected 2 problems, got ${partialProblems.length}: ${partialProblems.join("; ")}`
    );
  }

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error("  - " + f);
    process.exit(1);
  }
  console.log(
    `${LABEL} SELFTEST OK — the real pre-fix defect caught (2/2), the real fixed file clears, a ` +
      `partial "isError mentioned but not real gate" regression caught (2/2).`
  );
  process.exit(0);
}

const src = fs.readFileSync(FILE_PATH, "utf8");
const problems = checkCsaScoreErrorState(src);
if (problems.length) {
  console.error(`${LABEL} FAIL — ${problems.length} problem(s):`);
  for (const p of problems) console.error("  ✗ " + p);
  process.exit(1);
}
console.log(
  `${LABEL} OK — CSAScore.tsx's currentQuery and trendsQuery both render real error states on failure, matching the file's own pullMutation.isError pattern.`
);
