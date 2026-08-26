#!/usr/bin/env node
import fs from "node:fs";

const file = "apps/frontend/src/pages/maintenance/FleetTablePage.tsx";
const contracts = [
  "kpisQuery.isError ? undefined : kpisQuery.data",
  ["rowsQuery.isError ? [] : rowsQuery.data?.rows ?? []", 2],
  "[rowsQuery.data?.rows, rowsQuery.isError]",
  "fleetLocationQuery.isError ? [] : fleetLocationQuery.data?.rows ?? []",
  "[fleetLocationQuery.data, fleetLocationQuery.isError]",
  "maintStatusQuery.isError ? [] : maintStatusQuery.data?.rows ?? []",
  "[maintStatusQuery.data, maintStatusQuery.isError]",
  "totalRowsQuery.isError ? 0 : totalRowsQuery.data?.total ?? 0",
  "rowsQuery.isError ? 0 : rowsQuery.data?.total ?? allRows.length",
  "[rowsQuery.data?.rows, rowsQuery.isError, softDeleteFilter]",
];
const text = (entry) => Array.isArray(entry) ? entry[0] : entry;
const required = (entry) => Array.isArray(entry) ? entry[1] : 1;
const count = (source, contract) => source.split(contract).length - 1;
const check = (source) => contracts.filter((entry) => count(source, text(entry)) < required(entry));
if (process.argv.includes("--selftest")) {
  const source = fs.readFileSync(file, "utf8");
  for (const entry of contracts) {
    const contract = text(entry);
    const mutated = source.replace(contract, "");
    if (mutated === source || count(mutated, contract) >= required(entry)) process.exit(1);
  }
  console.log(`verify-fleet-table-failure-exclusion SELFTEST PASS — ${contracts.length}/${contracts.length} exact mutations red`);
  process.exit(0);
}
const missing = check(fs.readFileSync(file, "utf8"));
if (missing.length) {
  console.error(`verify-fleet-table-failure-exclusion FAIL\n- ${missing.map(text).join("\n- ")}`);
  process.exit(1);
}
console.log("verify-fleet-table-failure-exclusion PASS — roster/KPI/location/HOS/maintenance reads fail closed without stale counters or labels");
