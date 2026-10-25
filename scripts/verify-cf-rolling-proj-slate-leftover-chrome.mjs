#!/usr/bin/env node
// BANK leftover refuse — RollingLedgerTab / ManualDailyProjectionsTab / DailyPredictionTab
// + D043 (owner 10-24): day / invoice / due labels = formatDateUS (MM/DD/YYYY), never
// month-name or year-less toLocaleDateString chips.
import { readFileSync } from "node:fs";

const TARGETS = [
  "apps/frontend/src/pages/cash-flow/tabs/RollingLedgerTab.tsx",
  "apps/frontend/src/pages/cash-flow/tabs/ManualDailyProjectionsTab.tsx",
  "apps/frontend/src/pages/cash-flow/tabs/DailyPredictionTab.tsx",
];
const LABEL = "verify-cf-rolling-proj-slate-leftover-chrome";

function leftoverHits(src) {
  const hits = [];
  if (
    src.includes("text-slate-") ||
    src.includes("border-slate-") ||
    src.includes("border-l-slate-") ||
    src.includes("bg-slate-") ||
    src.includes("hover:bg-slate-") ||
    src.includes("divide-slate-") ||
    src.includes("ring-slate-") ||
    src.includes("focus-visible:ring-slate-")
  ) {
    hits.push("leftover slate class");
  }
  return hits;
}

/** D043 — visible date cells must go through formatDateUS; forbid month-name locale chips. */
function d043Hits(path, src) {
  const hits = [];
  if (!/formatDateUS/.test(src) || !/from ["'][^"']*lib\/formatDate["']/.test(src)) {
    hits.push(`${path}: D043 must import formatDateUS from lib/formatDate`);
  }
  if (/toLocaleDateString\s*\(/.test(src)) {
    hits.push(`${path}: D043 forbids toLocaleDateString on cash-flow date labels (use formatDateUS)`);
  }
  if (/month:\s*["']short["']/.test(src) || /month:\s*["']long["']/.test(src)) {
    hits.push(`${path}: D043 forbids month-name date chips (use MM/DD/YYYY via formatDateUS)`);
  }
  return hits;
}

function audit(sources) {
  const fails = [];
  for (const [path, src] of sources) {
    for (const e of leftoverHits(src)) fails.push(`${path}: ${e}`);
    for (const e of d043Hits(path, src)) fails.push(e);
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
    const d043Plant = src0
      .replace(/formatDateUS/g, "fmtLocale")
      .replace(/from ["'][^"']*lib\/formatDate["']/, 'from "../../../lib/gone"');
    const d043Planted = `${d043Plant}\nconst x = d.toLocaleDateString("en-US", { month: "short", day: "2-digit" });\n`;
    if (!audit([[path0, d043Planted], ...sources.slice(1)]).some((e) => e.includes("D043"))) {
      console.error(`${LABEL} SELFTEST FAIL D043 plant escaped`);
      process.exit(1);
    }
    console.log(`${LABEL}: SELFTEST PASS leftover slate + D043 plants`);
    process.exit(0);
  }
  const fails = audit(sources);
  if (fails.length) {
    console.error(`${LABEL}: FAIL`);
    for (const e of fails) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS leftover slate refuse + D043 formatDateUS (${TARGETS.length} files)`);
}
main();
