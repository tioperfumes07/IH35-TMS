#!/usr/bin/env node
/**
 * verify-lane-mileage-merge-and-rescore.mjs
 *
 * GO-19-2b Section 0 (owner-approved 2026-09-03): merge-and-rescore-lane-mileage.mjs must (a)
 * merge duplicate lane-key spelling/formatting variants BEFORE scoring confidence (run-count +
 * relative-spread%, never absolute miles) and (b) never derive practical_min/practical_max --
 * leave both NULL, since this source has no true per-run min/max to recover.
 */
import { readFileSync } from "node:fs";

const SCRIPT_PATH = "scripts/ops/merge-and-rescore-lane-mileage.mjs";

function loadSource() {
  return readFileSync(SCRIPT_PATH, "utf8");
}

export function collectFailures(src = loadSource()) {
  const failures = [];

  // Merge must run before scoring: mergeGroups() output feeds scoreConfidence(), not raw rows.
  if (!/mergeGroups\(before\.rows, aliasMap\)\.map\(scoreConfidence\)/.test(src)) {
    failures.push("merge must happen before rescoring (mergeGroups(...).map(scoreConfidence) not found)");
  }

  // Confidence formula: run-count + RELATIVE spread (percent of practical_miles), never absolute miles.
  if (!/practical_spread \/ row\.practical_miles\) \* 100/.test(src)) {
    failures.push("confidence formula does not compute relative spread as a percentage of practical_miles");
  }
  if (!/n_practical >= 3 && relSpreadPct <= 5/.test(src)) {
    failures.push("High tier threshold (n_practical>=3, relSpreadPct<=5) missing");
  }
  if (!/n_practical >= 2 && relSpreadPct <= 15/.test(src)) {
    failures.push("Check ZIP tier threshold (n_practical>=2, relSpreadPct<=15) missing");
  }

  // practical_min/practical_max: owner-rejected derivation. Must always write literal NULL.
  const insertSection = src.slice(src.indexOf("INSERT INTO catalogs.lane_mileage"));
  if (!/practical_min,\s*practical_max\s*\)\s*VALUES/.test(insertSection)) {
    failures.push("practical_min/practical_max columns missing from the INSERT");
  }
  if (!/NULL,\s*NULL\s*\)`/.test(insertSection)) {
    failures.push("practical_min/practical_max no longer write a literal NULL pair");
  }
  const valuesTail = insertSection.split("VALUES")[1] ?? "";
  if (/practical_min\s*[:=]\s*[a-zA-Z]/.test(valuesTail) || /r\.practical_min|r\.practical_max/.test(valuesTail)) {
    failures.push("practical_min/practical_max appears to be computed from a row field, not a literal NULL");
  }

  // Merged n_practical is a SUM (not overwritten by one variant's count), the specific defect the
  // owner named: "367 runs and 9 runs treated as two different lanes."
  if (!/g\.rows\.reduce\(\(s, r\) => s \+ Number\(r\.n_practical \|\| 0\), 0\)/.test(src)) {
    failures.push("merged n_practical is not a sum across the group's variant rows");
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const baseline = collectFailures();
  if (baseline.length) {
    console.error(`verify-lane-mileage-merge-and-rescore SELFTEST FAIL — good sources rejected: ${baseline.join(" | ")}`);
    process.exit(1);
  }
  const src = loadSource();
  const mutations = [
    ["merge-before-score order", "mergeGroups(before.rows, aliasMap).map(scoreConfidence)", "before.rows.map(scoreConfidence)"],
    ["relative spread computation", "practical_spread / row.practical_miles) * 100", "practical_spread"],
    ["High tier threshold", "n_practical >= 3 && relSpreadPct <= 5", "false"],
    ["Check ZIP tier threshold", "n_practical >= 2 && relSpreadPct <= 15", "false"],
    ["NULL literal pair", "NULL, NULL\n       )`", "$1, $2\n       )`"],
    ["n_practical sum", "g.rows.reduce((s, r) => s + Number(r.n_practical || 0), 0)", "g.rows[0].n_practical"],
  ];
  const escaped = [];
  for (const [name, from, to] of mutations) {
    if (!src.includes(from)) {
      escaped.push(`${name} (plant target not found -- source drifted)`);
      continue;
    }
    const planted = src.replace(from, to);
    if (planted === src || collectFailures(planted).length === 0) escaped.push(name);
  }
  if (escaped.length) {
    console.error(`verify-lane-mileage-merge-and-rescore SELFTEST FAIL — escaped: ${escaped.join(", ")}`);
    process.exit(1);
  }
  console.log(`verify-lane-mileage-merge-and-rescore SELFTEST PASS — ${mutations.length}/${mutations.length} plants rejected`);
}

const failures = collectFailures();

if (failures.length > 0) {
  console.error("verify-lane-mileage-merge-and-rescore: FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(
  "verify-lane-mileage-merge-and-rescore: OK — duplicate lane-key variants merge before rescoring, confidence is run-count + relative-spread, practical_min/practical_max stay literal NULL"
);
