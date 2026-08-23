#!/usr/bin/env node
/** @matrix-built {"modules":["reports"],"cols":["connectivity","reverse_link"],"leafRe":"^runner\\.(profit_per_truck|driver_settlement|ar_aging|dispatch_margin|maint_cost_unit|fuel_savings|fuel_price_variance)$","task":"LV-REPORTS-RUNNER-ENTITY-LINK-CONFIG-GAPS"} */
import fs from "node:fs";

const CONFIG_PATH = "apps/frontend/src/pages/reports/runners/runner-config.ts";
const TABLE_PATH = "apps/frontend/src/pages/reports/runners/RunnerTable.tsx";
const FUEL_SAVINGS_PATH = "apps/backend/src/reports/fuel-savings.routes.ts";
const config = fs.readFileSync(CONFIG_PATH, "utf8");
const table = fs.readFileSync(TABLE_PATH, "utf8");
const fuelSavings = fs.readFileSync(FUEL_SAVINGS_PATH, "utf8");

const exactLinks = [
  ["profit-per-truck", "unit", 'key: "unit_number", label: "Unit", align: "left", sortable: true, entityKind: "unit", entityIdKey: "unit_id"'],
  ["driver-settlement", "driver", 'key: "driver_name", label: "Driver", align: "left", sortable: true, entityKind: "driver", entityIdKey: "driver_id"'],
  ["ar-aging", "customer", 'key: "customer_name", label: "Customer", align: "left", format: "text", sortable: true, entityKind: "customer", entityIdKey: "customer_id"'],
  ["dispatch-margin", "load", 'key: "load_number", label: "Load", align: "left", sortable: true, entityKind: "load", entityIdKey: "load_id"'],
  ["dispatch-margin", "customer", 'key: "customer_name", label: "Customer", align: "left", sortable: true, entityKind: "customer", entityIdKey: "customer_id"'],
  ["maint-cost-unit", "unit", 'key: "unit_number", label: "Unit", align: "left", sortable: true, entityKind: "unit", entityIdKey: "unit_id"'],
  ["fuel-savings", "driver", 'key: "driver_name", label: "Driver", align: "left", sortable: true, entityKind: "driver", entityIdKey: "driver_id"'],
  ["fuel-price-variance", "unit", 'key: "unit_number", label: "Unit", align: "left", sortable: true, entityKind: "unit", entityIdKey: "unit_id"'],
];

function reportBlock(source, reportId) {
  const start = source.indexOf(`  "${reportId}": {`);
  if (start < 0) return "";
  const end = source.indexOf("\n  \"", start + 4);
  return source.slice(start, end < 0 ? source.length : end);
}

function mutateReport(source, reportId, snippet) {
  const block = reportBlock(source, reportId);
  return source.replace(block, block.replace(snippet, snippet.replace(/, entityKind: .*$/, "")));
}

function failures(configSource = config, tableSource = table, fuelSavingsSource = fuelSavings) {
  const missing = exactLinks
    .filter(([reportId, , snippet]) => !reportBlock(configSource, reportId).includes(snippet))
    .map(([reportId, entity]) => `${reportId}.${entity} typed EntityLink metadata`);
  if (!tableSource.includes("<EntityLink kind={column.entityKind}")) missing.push("shared RunnerTable EntityLink renderer");
  if (!tableSource.includes("row.record[column.entityIdKey]")) missing.push("shared RunnerTable canonical id binding");
  for (const needle of [
    "FROM mdata.driver_company_authorizations fuel_savings_driver_dca",
    "fuel_savings_driver_dca.driver_id = d.id",
    "fuel_savings_driver_dca.company_id = s.operating_company_id",
    "fuel_savings_driver_dca.is_authorized = true",
    "fuel_savings_driver_dca.deactivated_at IS NULL",
  ]) {
    if (!fuelSavingsSource.includes(needle)) missing.push(`fuel-savings driver resolver missing ${needle}`);
  }
  return missing;
}

if (process.argv.includes("--selftest")) {
  let caught = 0;
  for (const [reportId, entity, snippet] of exactLinks) {
    const mutated = mutateReport(config, reportId, snippet);
    if (!failures(mutated).includes(`${reportId}.${entity} typed EntityLink metadata`)) {
      throw new Error(`planted ${reportId}.${entity} metadata defect escaped`);
    }
    caught += 1;
  }
  const tableMutation = table.replace("<EntityLink kind={column.entityKind}", "<span data-kind={column.entityKind}");
  if (!failures(config, tableMutation).includes("shared RunnerTable EntityLink renderer")) {
    throw new Error("planted shared renderer defect escaped");
  }
  for (const needle of [
    "FROM mdata.driver_company_authorizations fuel_savings_driver_dca",
    "fuel_savings_driver_dca.driver_id = d.id",
    "fuel_savings_driver_dca.company_id = s.operating_company_id",
    "fuel_savings_driver_dca.is_authorized = true",
    "fuel_savings_driver_dca.deactivated_at IS NULL",
  ]) {
    const mutated = fuelSavings.replace(needle, "REMOVED");
    if (!failures(config, table, mutated).some((entry) => entry.includes(needle))) {
      throw new Error(`planted fuel-savings resolver defect escaped: ${needle}`);
    }
    caught += 1;
  }
  console.log(`verify-reports-runner-entity-link-vertical SELFTEST PASS — ${caught + 1}/${exactLinks.length + 6} planted defects rejected`);
  process.exit(0);
}

const missing = failures();
if (missing.length) {
  console.error(`verify-reports-runner-entity-link-vertical FAIL\n${missing.join("\n")}`);
  process.exit(1);
}
console.log(`verify-reports-runner-entity-link-vertical PASS — ${exactLinks.length} canonical label/id bindings use the shared typed EntityLink renderer`);
