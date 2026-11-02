#!/usr/bin/env node
// BANK leftover refuse — CoverageGapDashboard / PolicyDetail / TypeCatalogAdmin
// must use house tokens, never leftover Tailwind slate-* classes.
import { readFileSync } from "node:fs";

const TARGETS = [
  "apps/frontend/src/pages/insurance/CoverageGapDashboard.tsx",
  "apps/frontend/src/pages/insurance/PolicyDetail.tsx",
  "apps/frontend/src/pages/insurance/TypeCatalogAdmin.tsx",
];
const LABEL = "verify-ins-cov-pol-slate-leftover-chrome";

function leftoverHits(src) {
  const hits = [];
  if (
    src.includes("text-slate-") ||
    src.includes("border-slate-") ||
    src.includes("bg-slate-") ||
    src.includes("hover:bg-slate-") ||
    src.includes("ring-slate-")
  ) {
    hits.push("leftover slate class");
  }
  return hits;
}

/** fill-not-shell — Coverage Gap + Type Catalog must use BoardSection + U18 back. */
function boardShellHits(path, src) {
  const hits = [];
  if (path.endsWith("CoverageGapDashboard.tsx")) {
    if (!src.includes('from "../../components/v3/BoardSection"')) hits.push("must import BoardSection");
    if (!src.includes('testId="coverage-gap-by-type-board"')) hits.push("coverage-gap-by-type-board BoardSection required");
    if (!src.includes('backHref="/insurance"')) hits.push("PageHeader backHref=/insurance required");
  }
  if (path.endsWith("TypeCatalogAdmin.tsx")) {
    if (!src.includes('from "../../components/v3/BoardSection"')) hits.push("must import BoardSection");
    if (!src.includes('testId="type-catalog-list-board"')) hits.push("type-catalog-list-board BoardSection required");
    if (!src.includes('backHref="/insurance"')) hits.push("PageHeader backHref=/insurance required");
  }
  return hits;
}

function audit(sources) {
  const fails = [];
  for (const [path, src] of sources) {
    for (const e of leftoverHits(src)) fails.push(`${path}: ${e}`);
    for (const e of boardShellHits(path, src)) fails.push(`${path}: ${e}`);
  }
  return fails;
}

function main() {
  const sources = TARGETS.map((path) => [path, readFileSync(path, "utf8")]);
  const selftest = process.argv.includes("--selftest");

  if (selftest) {
    const [path0, src0] = sources[0];
    const planted = `${src0}\n<span className="text-slate-700 border-slate-200 bg-slate-50">plant</span>\n`;
    if (!audit([[path0, planted], ...sources.slice(1)]).some((e) => e.includes(path0) && e.includes("leftover slate class"))) {
      console.error(`${LABEL} SELFTEST FAIL leftover plant escaped`);
      process.exit(1);
    }
    const boardPlant = src0
      .replace(/from ["']\.\.\/\.\.\/components\/v3\/BoardSection["']/g, 'from "../../components/v3/Stripped"')
      .replace(/testId="coverage-gap-by-type-board"/g, 'testId="x"')
      .replace(/backHref="\/insurance"/g, "");
    if (!audit([[path0, boardPlant], ...sources.slice(1)]).some((e) => e.includes(path0) && e.includes("BoardSection"))) {
      console.error(`${LABEL} SELFTEST FAIL board-shell plant escaped`);
      process.exit(1);
    }
    console.log(`${LABEL}: SELFTEST PASS leftover slate + board-shell plants`);
    process.exit(0);
  }

  const fails = audit(sources);
  if (fails.length) {
    console.error(`${LABEL}: FAIL`);
    for (const e of fails) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS leftover slate class refuse (${TARGETS.length} files)`);
}

main();
