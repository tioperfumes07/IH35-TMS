#!/usr/bin/env node
/**
 * FAIL-BM1 — a bank-match candidate row's PRIMARY click must SELECT the candidate, never drill through.
 *
 * The row previously had no click handler: selection was reachable only through a small radio, while the
 * most prominent clickable element in the row was the EntityLink to the expense/bill. The natural click
 * therefore navigated AWAY from the match being made and closed the drawer with nothing matched — which is
 * what blocked the bank-match walk.
 *
 * Two properties, and BOTH matter:
 *   1. the row selects on click;
 *   2. the drill-through link stops propagation, so navigating does not silently change the selection on
 *      the way out.
 * A fix that only does (1) makes every drill-through mutate the selection.
 *
 *   node scripts/verify-match-candidate-row-selects.mjs [--selftest]
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SELFTEST = process.argv.includes("--selftest");
const LABEL = "verify-match-candidate-row-selects";
const DRAWER = "apps/frontend/src/pages/banking/components/MatchDrawer.tsx";

function assert(files) {
  const problems = [];
  const src = files[DRAWER] ?? "";

  const rowBlock = /data-testid="match-candidate-row"[\s\S]{0,400}?onClick=\{\(\) => setSelectedId\(/.test(src);
  if (!rowBlock) {
    problems.push(
      `${DRAWER}: the match-candidate row must select on click (onClick -> setSelectedId). Without it the ` +
        `only select affordance is the radio while the prominent one is the drill-through link, so the ` +
        `natural click navigates away from the match (FAIL-BM1).`,
    );
  }

  if (!/data-testid="match-candidate-drillthrough"[\s\S]{0,80}|onClick=\{\(event\) => event\.stopPropagation\(\)\}[\s\S]{0,120}match-candidate-drillthrough/.test(src)) {
    problems.push(`${DRAWER}: the drill-through must be wrapped so it can stop propagation`);
  }
  if (!/onClick=\{\(event\) => event\.stopPropagation\(\)\}[\s\S]{0,200}EntityLink/.test(src)) {
    problems.push(
      `${DRAWER}: the drill-through EntityLink must stopPropagation, or navigating also mutates the ` +
        `selection on the way out.`,
    );
  }
  return problems;
}

const files = Object.fromEntries([DRAWER].map((r) => [r, readFileSync(path.join(ROOT, r), "utf8")]));

if (SELFTEST) {
  const checks = [];
  const noRow = { ...files, [DRAWER]: files[DRAWER].replace(/\n\s*onClick=\{\(\) => setSelectedId\(c\.ledger_entry_id\)\}/, "") };
  checks.push(["row select removed", assert(noRow).some((p) => /must select on click/.test(p))]);
  const noStop = { ...files, [DRAWER]: files[DRAWER].replace("onClick={(event) => event.stopPropagation()} ", "") };
  checks.push(["stopPropagation removed", assert(noStop).some((p) => /stopPropagation/.test(p))]);
  const failed = checks.filter(([, c]) => !c).map(([n]) => n);
  if (failed.length) {
    console.error(`${LABEL} SELFTEST FAIL — not caught: ${failed.join(", ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — ${checks.length}/${checks.length} planted regressions caught`);
  process.exit(0);
}

const problems = assert(files);
if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}
console.log(`${LABEL}: OK — row click selects; drill-through is secondary and does not change selection`);
process.exit(0);
