#!/usr/bin/env node
// BANK leftover refuse — QboStyleHomePage / DriverManagerHome / HomeKpiRangeToggle
import { readFileSync } from "node:fs";

const TARGETS = [
  "apps/frontend/src/pages/home/QboStyleHomePage.tsx",
  "apps/frontend/src/pages/home/roles/DriverManagerHome.tsx",
  "apps/frontend/src/pages/home/HomeKpiRangeToggle.tsx",
];
const LABEL = "verify-home-qbo-drv-mgr-kpi-slate-leftover-chrome";

function leftoverHits(src) {
  const hits = [];
  if (
    src.includes("text-slate-") ||
    src.includes("border-slate-") ||
    src.includes("border-l-slate-") ||
    src.includes("bg-slate-") ||
    src.includes("hover:bg-slate-") ||
    src.includes("hover:text-slate-") ||
    src.includes("focus:bg-slate-") ||
    src.includes("divide-slate-") ||
    src.includes("sm:divide-slate-") ||
    src.includes("ring-slate-") ||
    src.includes("decoration-slate-") ||
    src.includes("focus:ring-slate-") ||
    src.includes("focus-visible:ring-slate-") ||
    src.includes("focus:border-slate-")
  ) {
    hits.push("leftover slate class");
  }
  return hits;
}

function audit(sources) {
  const fails = [];
  for (const [path, src] of sources) {
    for (const e of leftoverHits(src)) fails.push(`${path}: ${e}`);
    // 443.257-D D002 — Home Overview money tiles always show cents (two decimals).
    if (path.endsWith("QboStyleHomePage.tsx")) {
      if (/maximumFractionDigits:\s*0/.test(src)) {
        fails.push(`${path}: D002 money tiles must not omit cents (maximumFractionDigits: 0)`);
      }
      if (!/formatMoneyCents/.test(src) || !/from ["'].*lib\/formatMoney["']/.test(src)) {
        fails.push(`${path}: D002 money tiles must format via shared formatMoneyCents`);
      }
    }
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
    const omitCents = src0.replace(/formatMoneyCents\(cents\)/, 'new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100)');
    if (!audit([[path0, omitCents], ...sources.slice(1)]).some((e) => e.includes("D002") && e.includes("omit cents"))) {
      console.error(`${LABEL} SELFTEST FAIL D002 omit-cents plant escaped`);
      process.exit(1);
    }
    console.log(`${LABEL}: SELFTEST PASS leftover slate + D002 cents plants`);
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
