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

  // LEAD 443.99 class B (2026-10-12) — practical_min/practical_max rule.
  //   old rule: the INSERT always writes a literal NULL pair; any row-sourced min/max fails.
  //   new rule: the INSERT writes practical_min/practical_max, sourced ONLY as MIN-of-observed-mins /
  //             MAX-of-observed-maxes over the merged variants (NULL when none observed); deriving
  //             them from practical_miles +/- spread is still forbidden.
  //   why: #20286 (LANE-MILEAGE-IMPORT-DROPPED-COLUMNS, owner-reported, 2026-09-04) rebuilt the source
  //        CSV with real per-row min/max; the owner's rejection (2026-09-03) was of the +/- spread/2
  //        formula, never of real observed values (see the ops script's header (b)). The old literal-NULL
  //        rule would now drop real data — the exact silent-drop class #20286 fixed.
  const insertSection = src.slice(src.indexOf("INSERT INTO catalogs.lane_mileage"));
  if (!/practical_min,\s*practical_max,/.test(insertSection)) {
    failures.push("practical_min/practical_max columns missing from the INSERT");
  }
  if (!/practicalRows\.map\(\(r\) => Number\(r\.practical_min\)\)/.test(src) || !/practicalRows\.map\(\(r\) => Number\(r\.practical_max\)\)/.test(src)) {
    failures.push("practical_min/practical_max are not collected from the variants' own observed min/max");
  }
  if (!/practical_min: practicalMins\.length > 0 \? Math\.min\(\.\.\.practicalMins\) : null/.test(src) ||
      !/practical_max: practicalMaxs\.length > 0 \? Math\.max\(\.\.\.practicalMaxs\) : null/.test(src)) {
    failures.push("practical_min/practical_max are not MIN-of-mins / MAX-of-maxes (NULL when none observed)");
  }
  if (/practical_m(?:in|ax)\s*:\s*[^,\n]*practical_spread/.test(src) || /practical_miles\s*[-+]\s*[^,\n]*spread\s*\/\s*2/.test(src)) {
    failures.push("practical_min/practical_max derived from practical_miles +/- spread (owner-rejected formula)");
  }

  // Merged n_practical is a SUM (not overwritten by one variant's count), the specific defect the
  // owner named: "367 runs and 9 runs treated as two different lanes."
  // (443.99: the sum now runs over the variants that carry practical data — practicalRows — so a
  // short-only variant's NULL n_practical cannot zero-weight a real value; still a sum, never one row.)
  if (!/practicalRows\.reduce\(\(s, r\) => s \+ Number\(r\.n_practical \|\| 0\), 0\)/.test(src)) {
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
    ["min-of-observed-mins", "practical_min: practicalMins.length > 0 ? Math.min(...practicalMins) : null", "practical_min: Number(practical_miles) - Number(practical_spread) / 2"],
    ["max-of-observed-maxes", "practical_max: practicalMaxs.length > 0 ? Math.max(...practicalMaxs) : null", "practical_max: practicalMaxs[0]"],
    ["observed mins collected", "practicalRows.map((r) => Number(r.practical_min))", "practicalRows.map((r) => Number(r.practical_miles))"],
    ["n_practical sum", "practicalRows.reduce((s, r) => s + Number(r.n_practical || 0), 0)", "Number(practicalRows[0]?.n_practical || 0)"],
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
  "verify-lane-mileage-merge-and-rescore: OK — duplicate lane-key variants merge before rescoring, confidence is run-count + relative-spread, practical_min/practical_max are MIN/MAX of observed values, never derived from spread"
);
