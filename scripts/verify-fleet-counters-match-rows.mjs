#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const targetFile = path.join(process.cwd(), "apps/frontend/src/pages/maintenance/FleetTablePage.tsx");
const source = fs.readFileSync(targetFile, "utf8");
const LABEL = "verify-fleet-counters-match-rows";

export function audit(src) {
  const failures = [];
  if (/value=\{kpis\.(?:total_units|active_units|in_shop_units|out_of_service_units)\}/.test(src))
    failures.push("KPI cards are still bound to kpisQuery fields");
  if (!src.includes("const counters = useMemo(() =>")) failures.push("missing counters useMemo derivation");
  if (!/\}, \[rowsQuery\.data\?\.rows, softDeleteFilter\]\);/.test(src))
    failures.push("counters must depend on roster rows and the active/inactive slice");

  const required = [
    /const sourceRows = \(rowsQuery\.data\?\.rows \?\? \[\]\)\.filter\(/,
    /softDeleteFilter === "active" && r\.deactivated_at != null/,
    /softDeleteFilter === "inactive" && r\.deactivated_at == null/,
    /total: sourceRows\.length/,
    /active: sourceRows\.filter\(\(r\) => r\.status === "InService"\)\.length/,
    /inShop: sourceRows\.filter\(\(r\) => r\.status === "InMaintenance"\)\.length/,
    /outOfService: sourceRows\.filter\(\(r\) => rowMatchesFleetStatus\(r, "OutOfService"\)\)\.length/,
    /value=\{counters\.total\}/,
    /value=\{counters\.active\}/,
    /value=\{counters\.inShop\}/,
    /value=\{counters\.outOfService\}/,
  ];
  for (const pattern of required) if (!pattern.test(src)) failures.push(`missing counter contract: ${pattern.source}`);
  return failures;
}

if (process.argv.includes("--selftest")) {
  if (audit(source).length) throw new Error(`repo source rejected: ${audit(source).join("; ")}`);
  const mutations = [
    source.replace('[rowsQuery.data?.rows, softDeleteFilter]', '[rowsQuery.data?.rows]'),
    source.replaceAll('softDeleteFilter === "active" && r.deactivated_at != null', 'false'),
    source.replace('rowMatchesFleetStatus(r, "OutOfService")', 'r.status === "OutOfService"'),
    source.replace('value={counters.total}', 'value={kpis.total_units}'),
  ];
  for (const [index, mutated] of mutations.entries()) {
    if (mutated === source || audit(mutated).length === 0) throw new Error(`planted defect ${index + 1} escaped`);
  }
  console.log(`[${LABEL}] selftest PASS (${mutations.length}/${mutations.length})`);
  process.exit(0);
}

const failures = audit(source);
if (failures.length) {
  console.error(`[${LABEL}] FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`[${LABEL}] PASS — fleet KPIs share the roster's soft-delete slice and status classifier`);
