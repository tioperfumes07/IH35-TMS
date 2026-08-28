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
  if (!/\}, \[rowsQuery\.data\?\.rows, rowsQuery\.isError, softDeleteFilter\]\);/.test(src))
    failures.push("counters must depend on roster rows and the active/inactive slice");

  const required = [
    /const sourceRows = \(rowsQuery\.isError \? \[\] : rowsQuery\.data\?\.rows \?\? \[\]\)\.filter\(/,
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
  const recovery = [
    /listState\.isError[\s\S]*rowsQuery\.refetch\(\)[\s\S]*listState\.isEmpty/,
    /kpisQuery\.isError[\s\S]*kpisQuery\.refetch\(\)/,
    /totalRowsQuery\.isError[\s\S]*totalRowsQuery\.refetch\(\)/,
    /fleetLocationQuery\.isError[\s\S]*fleetLocationQuery\.refetch\(\)/,
    /maintStatusQuery\.isError[\s\S]*maintStatusQuery\.refetch\(\)/,
    /async function exportLocationHos\(\)[\s\S]*await downloadFleetLocationHosXlsx\(operatingCompanyId\)[\s\S]*setLocationHosExportError\("Location \+ HOS export failed\.[\s\S]*data-testid="fleet-location-hos-export-error"[\s\S]*onClick=\{\(\) => void exportLocationHos\(\)\}[\s\S]*Retry/,
  ];
  if (/downloadFleetLocationHosXlsx\(operatingCompanyId\)\.catch\(\(\) => undefined\)/.test(src))
    failures.push("fleet Location + HOS export still swallows download failures");
  for (const pattern of recovery) if (!pattern.test(src)) failures.push(`missing exact fleet feed recovery: ${pattern.source}`);
  return failures;
}

if (process.argv.includes("--selftest")) {
  if (audit(source).length) throw new Error(`repo source rejected: ${audit(source).join("; ")}`);
  const mutations = [
    source.replace('[rowsQuery.data?.rows, rowsQuery.isError, softDeleteFilter]', '[rowsQuery.data?.rows, softDeleteFilter]'),
    source.replace('const sourceRows = (rowsQuery.isError ? [] : rowsQuery.data?.rows ?? [])', 'const sourceRows = (rowsQuery.data?.rows ?? [])'),
    source.replaceAll('softDeleteFilter === "active" && r.deactivated_at != null', 'false'),
    source.replace('rowMatchesFleetStatus(r, "OutOfService")', 'r.status === "OutOfService"'),
    source.replace('value={counters.total}', 'value={kpis.total_units}'),
    source.replace('onRetry={() => void rowsQuery.refetch()}', ''),
    source.replace('onRetry={() => void kpisQuery.refetch()}', ''),
    source.replace('onRetry={() => void totalRowsQuery.refetch()}', ''),
    source.replace('onRetry={() => void fleetLocationQuery.refetch()}', ''),
    source.replace('onRetry={() => void maintStatusQuery.refetch()}', ''),
    source.replace('setLocationHosExportError("Location + HOS export failed. Check the fleet feed and try again.");', ''),
    source.replace('data-testid="fleet-location-hos-export-error"', ''),
    source.replace('onClick={() => void exportLocationHos()}>\n              Retry', '>\n              Retry'),
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
