#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const targetFile = path.join(repoRoot, "apps/frontend/src/pages/maintenance/FleetTablePage.tsx");
const source = fs.readFileSync(targetFile, "utf8");

if (source.includes("value={kpis.total_units}") || source.includes("value={kpis.active_units}") || source.includes("value={kpis.in_shop_units}") || source.includes("value={kpis.out_of_service_units}")) {
  console.error("[verify-fleet-counters-match-rows] KPI cards are still bound to kpisQuery fields");
  process.exit(1);
}

if (!source.includes("const counters = useMemo(() =>")) {
  console.error("[verify-fleet-counters-match-rows] Missing counters useMemo derivation");
  process.exit(1);
}

if (!source.includes("}, [rowsQuery.data?.rows]);")) {
  console.error("[verify-fleet-counters-match-rows] counters useMemo must depend on rowsQuery.data?.rows");
  process.exit(1);
}

const requiredDerivations = [
  "total: sourceRows.length",
  'active: sourceRows.filter((r) => r.status === "InService").length',
  'inShop: sourceRows.filter((r) => r.status === "InMaintenance").length',
  'outOfService: sourceRows.filter((r) => r.status === "OutOfService").length',
  'const sourceRows = rowsQuery.data?.rows ?? [];',
];
for (const token of requiredDerivations) {
  if (!source.includes(token)) {
    console.error(`[verify-fleet-counters-match-rows] Missing counter derivation: ${token}`);
    process.exit(1);
  }
}

const requiredBindings = [
  "value={counters.total}",
  "value={counters.active}",
  "value={counters.inShop}",
  "value={counters.outOfService}",
];
for (const binding of requiredBindings) {
  if (!source.includes(binding)) {
    console.error(`[verify-fleet-counters-match-rows] Missing KPI card counters binding: ${binding}`);
    process.exit(1);
  }
}

console.log("[verify-fleet-counters-match-rows] OK");
