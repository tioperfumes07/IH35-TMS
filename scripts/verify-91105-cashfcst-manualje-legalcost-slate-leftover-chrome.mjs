#!/usr/bin/env node
// leftover slate refuse + D065 Manual JE Class/Debit overlap (minmax grid tracks).
import { readFileSync } from "node:fs";
const TARGETS = [
  "apps/frontend/src/components/cash-flow/CashForecastReverseSection.tsx",
  "apps/frontend/src/components/accounting/ManualJEModal.tsx",
  "apps/frontend/src/components/accounting/LegalMatterCostsReverseSection.tsx",
];
const JE = "apps/frontend/src/components/accounting/ManualJEModal.tsx";
const LABEL = "verify-91105-cashfcst-manualje-legalcost-slate-leftover-chrome";
function leftoverHits(src) {
  const hits = [];
  if (src.includes("text-slate-") || src.includes("border-slate-") || src.includes("border-l-slate-") || src.includes("border-t-slate-") || src.includes("bg-slate-") || src.includes("hover:bg-slate-") || src.includes("hover:text-slate-") || src.includes("focus:bg-slate-") || src.includes("divide-slate-") || src.includes("sm:divide-slate-") || src.includes("ring-slate-") || src.includes("decoration-slate-") || src.includes("focus:ring-slate-") || src.includes("focus-visible:ring-slate-") || src.includes("focus:border-slate-") || src.includes("outline-slate-") || src.includes("focus-visible:outline-slate-") || src.includes("accent-slate-") || src.includes("disabled:bg-slate-")) hits.push("leftover slate class");
  return hits;
}
/** D065 — Class must not sit on Debit: shared minmax(0,…) template + min-w-0 children. */
function d065Hits(path, src) {
  if (path !== JE) return [];
  const hits = [];
  // g-flag required: String#match without /g returns one hit (array length 1) even when header+row both match.
  const tmpl = /grid-cols-\[minmax\(0,2fr\)_minmax\(0,1\.3fr\)_minmax\(0,1fr\)_minmax\(0,1fr\)_minmax\(0,1\.6fr\)\]/g;
  if ((src.match(tmpl) || []).length < 2) {
    hits.push(`${path}: D065 header+rows must share minmax(0,…) 5-col grid (Class must shrink before Debit)`);
  }
  if (!/\[&>\*\]:min-w-0/.test(src)) {
    hits.push(`${path}: D065 line rows must set [&>*]:min-w-0 so pickers can shrink`);
  }
  return hits;
}
function audit(sources) {
  const fails = [];
  for (const [path, src] of sources) {
    for (const e of leftoverHits(src)) fails.push(`${path}: ${e}`);
    for (const e of d065Hits(path, src)) fails.push(e);
  }
  return fails;
}
function main() {
  const sources = TARGETS.map((path) => [path, readFileSync(path, "utf8")]);
  if (process.argv.includes("--selftest")) {
    const [path0, src0] = sources[0];
    const planted = `${src0}\n<span className="text-slate-700 border-slate-200 bg-slate-50">plant</span>\n`;
    if (!audit([[path0, planted], ...sources.slice(1)]).some((e) => e.includes(path0) && e.includes("leftover slate class"))) { console.error(`${LABEL} SELFTEST FAIL leftover plant escaped`); process.exit(1); }
    const jeIdx = sources.findIndex(([p]) => p === JE);
    const [, jeSrc] = sources[jeIdx];
    const d065Plant = jeSrc
      .replace(/grid-cols-\[minmax\(0,2fr\)_minmax\(0,1\.3fr\)_minmax\(0,1fr\)_minmax\(0,1fr\)_minmax\(0,1\.6fr\)\]/g, "grid-cols-5")
      .replace(/\[&>\*\]:min-w-0/g, "");
    const plantedSources = sources.map(([p, s], i) => (i === jeIdx ? [p, d065Plant] : [p, s]));
    if (!audit(plantedSources).some((e) => e.includes("D065"))) {
      console.error(`${LABEL} SELFTEST FAIL D065 plant escaped`);
      process.exit(1);
    }
    console.log(`${LABEL}: SELFTEST PASS leftover slate + D065 plants`); process.exit(0);
  }
  const fails = audit(sources);
  if (fails.length) { console.error(`${LABEL}: FAIL`); for (const e of fails) console.error(`  - ${e}`); process.exit(1); }
  console.log(`${LABEL}: PASS leftover slate refuse + D065 ManualJE minmax grid (${TARGETS.length} files)`);
}
main();
