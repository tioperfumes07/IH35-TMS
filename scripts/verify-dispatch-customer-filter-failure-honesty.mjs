#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch"],"cols":["customer","connectivity","picker_law"],"leaves":["home.list","home.kanban"],"task":"DSP-F7100-DISPATCH-CUSTOMER-FILTER-FAILURE-LOOKS-EMPTY","vertical":"class-sweep"} */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const file = join(root, "apps/frontend/src/components/dispatch/FilterBar.tsx");
const source = readFileSync(file, "utf8");
const selftest = process.argv.includes("--selftest");

function problems(src) {
  const found = [];
  if (!/customersQuery\.isError\s*\?\s*\([\s\S]*?<ListErrorState/.test(src)) found.push("customer roster failure must replace the picker with an explicit error state");
  if (!/title="Couldn't load customers"/.test(src)) found.push("customer failure must be named for the operator");
  if (!/onRetry=\{\(\) => void customersQuery\.refetch\(\)\}/.test(src)) found.push("customer failure must expose the exact query refetch");
  if (!/disabled=\{!operatingCompanyId \|\| customersQuery\.isLoading \|\| customersQuery\.isError\}/.test(src)) found.push("customer picker/create must fail closed while roster truth is loading or failed");
  if (!/customersQuery\.data\?\.customers \?\? \[\]/.test(src)) found.push("successful customer roster must still feed canonical options");
  return found;
}

if (selftest) {
  const mutations = [
    ["error branch", (s) => s.replace("customersQuery.isError ? (", "false ? (")],
    ["named failure", (s) => s.replace("Couldn't load customers", "Customers")],
    ["retry", (s) => s.replace("customersQuery.refetch()", "Promise.resolve()")],
    ["fail closed", (s) => s.replace(" || customersQuery.isLoading || customersQuery.isError", "")],
    ["canonical options", (s) => s.replace("customersQuery.data?.customers ?? []", "[]")],
  ];
  for (const [name, mutate] of mutations) {
    if (!problems(mutate(source)).length) {
      console.error(`SELFTEST FAIL: planted ${name} defect escaped`);
      process.exit(1);
    }
  }
  console.log(`PASS verify-dispatch-customer-filter-failure-honesty --selftest (${mutations.length} mutations)`);
  process.exit(0);
}

const found = problems(source);
if (found.length) {
  for (const issue of found) console.error(`FAIL: ${issue}`);
  process.exit(1);
}
console.log("PASS verify-dispatch-customer-filter-failure-honesty");
