#!/usr/bin/env node
/**
 * C-22 — Tabs + KPIs layout contracts (ops lane).
 * NavyPageSubNav locked h-7 / #14314F; DrillKpiCard empty tiles explain why.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fail = (m) => {
  console.error(`FAIL: ${m}`);
  process.exit(1);
};
const ok = (m) => console.log(`PASS: ${m}`);
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

function assertIncludes(rel, needles, label) {
  const src = read(rel);
  for (const n of needles) {
    if (!src.includes(n)) fail(`${label}: missing ${JSON.stringify(n)} in ${rel}`);
  }
  ok(label);
}

if (!process.argv.includes("--selftest")) {
  console.log("usage: node scripts/ops/verify-c22-tabs-kpis.mjs --selftest");
  process.exit(0);
}

assertIncludes(
  "apps/frontend/src/components/layout/NavyPageSubNav.tsx",
  ["data-c22-tab-height=\"h-7\"", "bg-[#14314F]", "h-7 items-center"],
  "C-22 NavyPageSubNav locked height + navy",
);

assertIncludes(
  "apps/frontend/src/components/layout/DrillKpiCard.tsx",
  ["data-kpi-empty-reason", "No data"],
  "C-22 DrillKpiCard empty tiles explain why",
);

assertIncludes(
  "apps/frontend/src/components/layout/KpiStrip.tsx",
  ["data-c22-kpi-strip"],
  "C-22 KpiStrip marked for consistent strip layout",
);

assertIncludes(
  "apps/frontend/src/pages/maintenance/components/MaintKpiRows.tsx",
  ["unavailable={LOAD_FAIL}", "Could not load this figure"],
  "C-22 MaintKpiRows uses unavailable on query error",
);

console.log("verify-c22-tabs-kpis --selftest OK");
