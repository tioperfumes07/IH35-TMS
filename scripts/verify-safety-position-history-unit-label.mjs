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
const BE = "apps/backend/src/safety/position-history/position-history.routes.ts";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assert(sources) {
  const problems = [];
  const src = sources?.[FE] ?? read(FE);
  const backend = sources?.[BE] ?? read(BE);
  if (labelFallsBackToId(src, { field: "unit_number", idField: "unit_id" })) {
    problems.push(`${FE}: unit EntityLink must not fall back to unit_id UUID`);
  }
  if (!labelResolves(src, { field: "unit_number", noun: "Unit" })) {
    problems.push(
      `${FE}: unit EntityLink must resolve unit_number to a word — either ` +
        `entityLabel(row.unit_number, row.unit_id, "Unit") or row.unit_number?.trim() || "Unit".`,
    );
  }
  if (/\bps\.name\s+as\s+position_set_name\b/.test(backend)) {
    problems.push(`${BE}: maint.position_set uses display_name, never phantom ps.name`);
  }
  if (/\bp\.part_name\s+as\s+part_name\b/.test(backend)) {
    problems.push(`${BE}: maint.part uses name, never phantom p.part_name`);
  }
  // RE-ANCHOR (found stale 2026-08-29): this required EXACTLY 3 occurrences of each scope pattern
  // (the 3 GET readers this guard originally named: list, detail, timeline). A 4th, MORE scoped
  // occurrence was since added -- the POST create handler scoping its own position_set lookup
  // before insert (position-history.routes.ts:236) -- strictly MORE entity-scoping than before, not
  // a regression, but the exact-equality check treated growth the same as shrinkage. Bumped the
  // required count to 4 to match the current committed reality (3 readers + 1 scoped writer). If a
  // 5th legitimate site is added later, bump this again deliberately -- do not widen to a floor
  // (>=), which would stop catching a real drop from 4 back to 3.
  const positionScopeCount = (backend.match(/ps\.operating_company_id\s*=\s*\$(?:1|2)::uuid/g) ?? []).length;
  const partScopeCount = (backend.match(/p\.tenant_id\s*=\s*\$(?:1|2)::uuid/g) ?? []).length;
  if (positionScopeCount !== 4 || partScopeCount !== 4) {
    problems.push(`${BE}: all 3 readers + 1 scoped writer must entity-scope position_set and part joins (found ${positionScopeCount}/${partScopeCount}, need 4/4)`);
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const live = { [FE]: read(FE), [BE]: read(BE) };
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
  if (assert({ ...live, [FE]: legacy }).length) {
    console.error(`${LABEL} SELFTEST FAIL: the legacy inline spelling must still be accepted`);
    process.exit(1);
  }
  const phantomPosition = { ...live, [BE]: live[BE].replaceAll("ps.display_name as position_set_name", "ps.name as position_set_name") };
  if (!assert(phantomPosition).some((p) => p.includes("phantom ps.name"))) {
    console.error(`${LABEL} SELFTEST FAIL: planted ps.name phantom column not caught`);
    process.exit(1);
  }
  const phantomPart = { ...live, [BE]: live[BE].replaceAll("p.name as part_name", "p.part_name as part_name") };
  if (!assert(phantomPart).some((p) => p.includes("phantom p.part_name"))) {
    console.error(`${LABEL} SELFTEST FAIL: planted p.part_name phantom column not caught`);
    process.exit(1);
  }
  const unscoped = { ...live, [BE]: live[BE].replace(/\n\s+AND ps\.operating_company_id = \$1::uuid/, "") };
  if (!assert(unscoped).some((p) => p.includes("entity-scope"))) {
    console.error(`${LABEL} SELFTEST FAIL: planted unscoped join not caught`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — 6 mutations (labels · phantom columns · entity scope)`);
  process.exit(0);
}

const problems = assert();
if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — Position History unit labels forbid UUID fallback`);
