#!/usr/bin/env node

/**
 * @matrix-built dispatch:overview.home:{connectivity}
 * DSP-F7532: the dashboard-only KPI source must explain its unavailable state
 * and expose exact recovery; a bare dash is not sufficient error honesty.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const relative = "apps/frontend/src/pages/dispatch/DispatchOverview.tsx";
const original = fs.readFileSync(path.join(process.cwd(), relative), "utf8");

function failures(source) {
  const found = [];
  if (!source.includes("dashboardQ.isLoading || dashboardQ.isError ? \"—\"")) {
    found.push("dashboard KPI must retain its non-fabricated error value");
  }
  if (!source.includes("dashboardQ.isError ? (")) {
    found.push("dashboard failure has no visible recovery boundary");
  }
  if (!source.includes('data-testid="dispatch-overview-dashboard-error"')) {
    found.push("dashboard failure has no stable test id");
  }
  if (!source.includes("Couldn't load the Dispatch overview totals.")) {
    found.push("dashboard failure lost source-specific context");
  }
  if (!source.includes("dashboardQ.refetch()")) {
    found.push("dashboard failure has no exact Retry");
  }
  return found;
}

const baseline = failures(original);
if (baseline.length) {
  console.error(`verify-dispatch-overview-dashboard-error: FAIL\n- ${baseline.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["honest KPI value", "dashboardQ.isLoading || dashboardQ.isError ? \"—\"", "dashboardQ.isLoading ? \"—\""],
    ["visible boundary", "dashboardQ.isError ? (", "dashboardQ.isPending ? ("],
    ["exact recovery", "dashboardQ.refetch()", "atRiskLateQ.refetch()"],
  ];
  const survivors = [];
  for (const [name, from, to] of mutations) {
    const mutated = original.replace(from, to);
    if (mutated === original || failures(mutated).length === 0) survivors.push(name);
  }
  if (survivors.length) {
    console.error(`verify-dispatch-overview-dashboard-error: SELFTEST FAIL — surviving mutations: ${survivors.join(", ")}`);
    process.exit(1);
  }
  console.log(`verify-dispatch-overview-dashboard-error: SELFTEST PASS — ${mutations.length}/${mutations.length} dashboard mutations rejected`);
  process.exit(0);
}

console.log("verify-dispatch-overview-dashboard-error: PASS — aggregate Dispatch KPIs fail visibly with exact Retry and no fake zero");
