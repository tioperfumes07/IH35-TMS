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

const MAINT_KPI_ROWS = "apps/frontend/src/pages/maintenance/components/MaintKpiRows.tsx";

function leftoverRefuse(src, failures) {
  if (src.includes("text-[11px]")) failures.push("leftover text-[11px]");
  if (src.includes("#8A92AB") || src.includes("#334155")) failures.push("leftover off-scale muted");
}

function assertMaintKpiRowsLeftover(src) {
  const failures = [];
  leftoverRefuse(src, failures);
  if (failures.length) fail(`C-22 MaintKpiRows leftover: ${failures.join("; ")}`);
}

function runLive() {
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
    MAINT_KPI_ROWS,
    ["unavailable={LOAD_FAIL}", "Could not load this figure"],
    "C-22 MaintKpiRows uses unavailable on query error",
  );
  assertMaintKpiRowsLeftover(read(MAINT_KPI_ROWS));
}

if (process.argv.includes("--selftest")) {
  runLive();
  const leftoverPlant = `${read(MAINT_KPI_ROWS)}\n<div className="text-[11px] text-[#8A92AB]">plant</div>`;
  const leftoverFailures = [];
  leftoverRefuse(leftoverPlant, leftoverFailures);
  if (!leftoverFailures.includes("leftover text-[11px]") || !leftoverFailures.includes("leftover off-scale muted")) {
    fail(`leftover plant escaped — ${leftoverFailures.join("; ")}`);
  }
  console.log("verify-c22-tabs-kpis --selftest OK + leftover plant rejected");
  process.exit(0);
}

runLive();
console.log("verify-c22-tabs-kpis PASS — leftover refuse hung on MaintKpiRows");
