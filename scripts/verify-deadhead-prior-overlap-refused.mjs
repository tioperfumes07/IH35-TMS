#!/usr/bin/env node
/**
 * Row 131 follow-up (LEAD 11-03): the deadhead engine never measures from a previous last stop when the truck's loads
 * overlap (another load of the unit has a stop between that stop and the pickup, or spans the pickup). Measured on prod:
 * 13687 got 1,875.6 empty miles from 13672's Swedesboro NJ although 13677 ran in between; 13690 the same (13693).
 * Static: priorLastStop computes overlap_load (both rules, canonical-load filtered, same unit + company); the
 * recommendation refuses with the load named; fillLoadDeadhead's same-place branch skips an overlapping prior.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-deadhead-prior-overlap-refused";
const FILE = "apps/backend/src/dispatch/mileage/miles-recommendations.service.ts";

export function findDefects(s) {
  const out = [];
  const i = s.indexOf("async function priorLastStop(");
  const fn = i < 0 ? "" : s.slice(i, s.indexOf("\n}\n", i));
  if (!fn) out.push("priorLastStop not found");
  if (!/AS overlap_load/.test(fn)) out.push("priorLastStop does not compute overlap_load");
  if (!/o\.assigned_unit_id = \$1::uuid AND o\.operating_company_id = \$2::uuid AND o\.id <> l\.id/.test(fn)) out.push("the overlap check is not scoped to the same unit + company, excluding the prior load");
  if (!/canonicalHappenedNotVoidedLoadClause\("o"\)/.test(fn)) out.push("the overlap check counts cancelled / voided loads");
  if (!/> ls\.at\s+AND COALESCE\([^)]*\) < \$4::timestamptz/.test(fn)) out.push("a load with a stop between the previous last stop and the pickup is not an overlap");
  if (!/min\(COALESCE\([^)]*\)\) < \$4::timestamptz\s+AND max\(COALESCE\([^)]*\)\) > \$4::timestamptz/.test(fn)) out.push("a load spanning the pickup is not an overlap");
  if (!/else if \(prior\.overlap_load\) googleEmptyMissing = /.test(s)) out.push("the recommendation measures across an overlap");
  if (!/if \(prior && !prior\.overlap_load && located\(prior\) && first\)/.test(s)) out.push("the same-place branch writes 0 across an overlap");
  return out;
}

const src = readFileSync(path.join(ROOT, FILE), "utf8");
if (process.argv.includes("--selftest")) {
  const plants = [
    ["no overlap column", src.replace("AS overlap_load", "AS overlap_x")],
    ["recommendation ignores overlap", src.replace("else if (prior.overlap_load) googleEmptyMissing = ", "else if (false) googleEmptyMissing = ")],
    ["same-place ignores overlap", src.replace("if (prior && !prior.overlap_load && located(prior) && first)", "if (prior && located(prior) && first)")],
    ["between rule dropped", src.replace("> ls.at\n", "> ls.at OR true\n")],
    ["span rule dropped", src.replace(/min\(COALESCE\(([^)]*)\)\) < \$4::timestamptz/, "min(COALESCE($1)) < now()")],
    ["counts voided loads", src.replace('canonicalHappenedNotVoidedLoadClause("o")', "true")],
    ["other units counted", src.replace("o.assigned_unit_id = $1::uuid AND ", "")],
  ];
  let caught = 0;
  for (const [name, planted] of plants) {
    const hit = planted !== src && findDefects(planted).length > 0;
    console.log(`${hit ? "ok  " : "MISS"}  plant: ${name}`);
    if (hit) caught++;
  }
  console.log(`${LABEL} SELFTEST: ${caught}/${plants.length} planted defects caught`);
  process.exit(caught === plants.length ? 0 : 1);
}
const d = findDefects(src);
if (d.length) { console.error(`${LABEL} FAIL:\n - ${d.join("\n - ")}`); process.exit(1); }
console.log(`${LABEL} PASS — no deadhead is measured across overlapping loads of one truck`);
