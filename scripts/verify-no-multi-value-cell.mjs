#!/usr/bin/env node
// ROUND 155.15 FIX B / 157-D item 2 (owner, verbatim): "IN PRE SETTLEMENT EACH LOAD NUMBER SHOULD
// HAVE ITS OWN COLUMN. NOT VARIOUS IN ONE. ITS CONFUSING AND NOT CLEAN." tourLoadColumns() used to
// render one "Load Number" cell containing the ENTIRE legs array (TourLegsCell's pill strip),
// and a sibling "Trip type" column that showed only legs[0], hiding every other leg's trip type on
// a multi-leg tour. Fixed to generate one column per leg (Leg 1..Leg N, N = the widest row in the
// result set), one leg per cell.
//
// This guard is a STATIC source-pattern check on TourLegsCell.tsx: fails if tourLoadColumns()
// reverts to mapping the whole `legs` array into a single cell/column (a ParityColumn whose render
// iterates `r.legs` directly and renders the WHOLE array, rather than indexing one leg per
// generated column), or if the legs[0]-only "Trip type" column reappears.
export const ALLOW_OFFLINE_SKIP =
  "pure static source-text scan of TourLegsCell.tsx -- never connects to a database.";

import fs from "node:fs";
import path from "node:path";

const LABEL = "verify-no-multi-value-cell";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const FILE = path.join(ROOT, "apps/frontend/src/components/dispatch/TourLegsCell.tsx");

export function checkFile(src) {
  const problems = [];
  if (!/function tourLoadColumns\s*\(/.test(src)) {
    problems.push("tourLoadColumns() not found.");
    return problems;
  }
  // The old bug shape: a single "load_numbers" column key whose render maps the WHOLE legs array
  // (<TourLegsCell legs={r.legs} />) into one cell.
  if (/key:\s*"load_numbers"/.test(src)) {
    problems.push('a "load_numbers" column still exists -- the old one-cell-for-every-leg shape. Each leg must be its own generated column ("leg_1", "leg_2", ...).');
  }
  if (/render:\s*r\s*=>\s*<TourLegsCell legs=\{r\.legs\}/.test(src)) {
    problems.push("a column still renders the WHOLE legs array into one cell via <TourLegsCell legs={r.legs} />. Generate one column per leg instead.");
  }
  // Required: dynamic, data-driven column generation (never a hard-coded leg count).
  if (!/reduce\(\(max, r\) => Math\.max\(max, \(r\.legs \?\? \[\]\)\.length\), 0\)/.test(src)) {
    problems.push("leg-column count is not computed from the widest row in the result set (Array.reduce over rows' own legs.length) -- looks hard-coded.");
  }
  if (!/key:\s*`leg_\$\{i \+ 1\}`/.test(src)) {
    problems.push('generated leg columns do not use a per-leg key ("leg_${i+1}") -- one column per leg is required.');
  }
  // The legs[0]-only Trip type column must be gone.
  if (/key:\s*"trip_types"/.test(src) || /Trip type of the first load/.test(src)) {
    problems.push('the old legs[0]-only "Trip type" column still exists -- trip type must live inside each leg\'s own cell now.');
  }
  return problems;
}

function selftest() {
  let bad = 0;
  const t = (name, cond) => {
    if (!cond) {
      console.error(`  SELFTEST FAIL: ${name}`);
      bad++;
    }
  };
  const BAD = `
    export function tourLoadColumns(prefix) {
      return [
        { key: "load_numbers", label: "Load Number", render: r => <TourLegsCell legs={r.legs} /> },
        { key: "trip_types", label: "Trip type", headerTitle: "Trip type of the first load", render: r => r.legs?.[0]?.trip_type },
      ];
    }
  `;
  const GOOD = `
    export function tourLoadColumns(prefix, rows) {
      const maxLegs = rows.reduce((max, r) => Math.max(max, (r.legs ?? []).length), 0);
      const legColumns = Array.from({ length: maxLegs }, (_, i) => ({
        key: \`leg_\${i + 1}\`,
        label: \`Leg \${i + 1}\`,
        render: (r) => <LegColumnCell leg={r.legs?.[i]} />,
      }));
      return [...legColumns, { key: "load_count", label: "Load count" }];
    }
  `;
  t("old one-cell shape fails", checkFile(BAD).length >= 1);
  t("new per-leg shape passes", checkFile(GOOD).length === 0);
  t("missing function fails", checkFile("").length >= 1);
  if (bad > 0) {
    console.log(`${LABEL} SELFTEST FAILED (${bad})`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  if (!fs.existsSync(FILE)) {
    console.error(`${LABEL}: FAIL — ${path.relative(ROOT, FILE)} does not exist.`);
    process.exit(1);
  }
  const problems = checkFile(fs.readFileSync(FILE, "utf8"));
  if (problems.length > 0) {
    console.error(`${LABEL}: FAIL — ${problems.length} issue(s):`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL}: OK — tourLoadColumns() generates one column per leg from the widest row in the result set; the legs[0]-only Trip type column is gone.`);
}

main();
