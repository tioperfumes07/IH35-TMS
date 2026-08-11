#!/usr/bin/env node
/**
 * GUARD 2194 — Position History unit EntityLink must not fall back to unit_id UUID.
 *
 * ★ DETECTOR WIDENED 2026-08-11 (CLS-GUARD-LITERAL-DETECTION). This guard used to demand the literal
 * `label={row.unit_number?.trim() || "Unit"}`. The page since moved to the shared helper —
 * `label={entityLabel(row.unit_number, row.unit_id, "Unit")}` — so the guard went RED on a page that
 * had become STRICTLY SAFER, and its selftest went INERT because the mutation it plants targets a
 * spelling the file no longer contains. The only way to green it was to un-harden the page.
 *
 * The assertion is unchanged; only the accepted spelling widened, via scripts/lib/entity-label-detect.mjs.
 * `entityLabel` is a superset of the inline form — it ALSO rejects a uuid-shaped value arriving in the
 * name column, which the inline `|| "Unit"` spelling renders verbatim.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { labelResolves, labelFallsBackToId } from "./lib/entity-label-detect.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-safety-position-history-unit-label";
const FE = "apps/frontend/src/pages/safety/PositionHistoryPage.tsx";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assert(sources) {
  const problems = [];
  const src = sources?.[FE] ?? read(FE);
  if (labelFallsBackToId(src, { field: "unit_number", idField: "unit_id" })) {
    problems.push(`${FE}: unit EntityLink must not fall back to unit_id UUID`);
  }
  if (!labelResolves(src, { field: "unit_number", noun: "Unit" })) {
    problems.push(
      `${FE}: unit EntityLink must resolve unit_number to a word — either ` +
        `entityLabel(row.unit_number, row.unit_id, "Unit") or row.unit_number?.trim() || "Unit".`,
    );
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const live = { [FE]: read(FE) };
  const liveProblems = assert(live);
  if (liveProblems.length) {
    console.error(`${LABEL} SELFTEST FAIL live:`, liveProblems);
    process.exit(1);
  }
  // The mutation must target the spelling the file ACTUALLY uses, or it plants nothing and the
  // selftest certifies a detector that never ran — the inert-mutation failure this guard shipped with.
  // Replace the whole label expression regardless of which spelling is live, then assert it was really
  // changed before scoring the result.
  const LABEL_EXPR = /label=\{[^}]*unit_number[^}]*\}/;
  if (!LABEL_EXPR.test(live[FE])) {
    console.error(`${LABEL} SELFTEST FAIL: no unit_number label expression found to mutate — INERT.`);
    process.exit(1);
  }
  const mutatedSrc = live[FE].replace(LABEL_EXPR, "label={row.unit_number ?? row.unit_id}");
  if (mutatedSrc === live[FE]) {
    console.error(`${LABEL} SELFTEST FAIL: mutation did not apply — INERT, the guard proves nothing.`);
    process.exit(1);
  }
  if (!assert({ [FE]: mutatedSrc }).some((p) => p.includes("UUID"))) {
    console.error(`${LABEL} SELFTEST FAIL: planted UUID fallback not caught`);
    process.exit(1);
  }
  // Second mutation: strip the label entirely — the "no human label at all" shape.
  const stripped = live[FE].replace(LABEL_EXPR, "label={row.unit_id}");
  if (!assert({ [FE]: stripped }).some((p) => p.includes("must resolve"))) {
    console.error(`${LABEL} SELFTEST FAIL: a label of the bare uuid was not caught`);
    process.exit(1);
  }
  // Third: the LEGACY inline spelling must still pass — widening must not orphan the old form.
  const legacy = live[FE].replace(LABEL_EXPR, 'label={row.unit_number?.trim() || "Unit"}');
  if (assert({ [FE]: legacy }).length) {
    console.error(`${LABEL} SELFTEST FAIL: the legacy inline spelling must still be accepted`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — 3 mutations (uuid fallback · bare id · legacy spelling)`);
  process.exit(0);
}

const problems = assert();
if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — Position History unit labels forbid UUID fallback`);
