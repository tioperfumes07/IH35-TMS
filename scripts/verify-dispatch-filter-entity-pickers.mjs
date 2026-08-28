#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch"],"cols":["customer"],"leaves":["home.list"],"task":"DSP-F7073-DISPATCH-CUSTOMER-FILTER-COMPLETE-ROSTER","vertical":"column-wave"} */
/** CLS-DISP-FILTER-EP — dispatch FilterBar customer/driver filters use canonical pickers. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILTER = "apps/frontend/src/components/dispatch/FilterBar.tsx";
const DISPATCH = "apps/frontend/src/pages/Dispatch.tsx";
const LABEL = "verify-dispatch-filter-entity-pickers";

export function collectSourceProblems(filter, dispatch) {
  const problems = [];
  if (!/ReferenceSelect[\s\S]*createKind=["']customer["']/.test(filter)) {
    problems.push(`${FILTER}: customer filter must use ReferenceSelect createKind=customer`);
  }
  if (!/EntityPicker[\s\S]*kind=["']driver["']/.test(filter) || !/allowCreate=\{false\}/.test(filter)) {
    problems.push(`${FILTER}: driver filter must use EntityPicker kind=driver allowCreate={false}`);
  }
  if (/customers\.map\([\s\S]*<Combobox/.test(filter.replace(/\/\/.*$/gm, ""))) {
    problems.push(`${FILTER}: must not Combobox over parent-fetched customer roster`);
  }
  if (/listCustomers\(/.test(dispatch) && /FilterBar/.test(dispatch)) {
    problems.push(`${DISPATCH}: must not listCustomers for FilterBar — picker owns roster fetch`);
  }
  if (!/customerSearch\s*\?[\s\S]*listCustomers\(\{[\s\S]*search:\s*customerSearch[\s\S]*:\s*listAllCustomers\(\{[\s\S]*operating_company_id:\s*operatingCompanyId[\s\S]*status:\s*"active"/.test(filter)) {
    problems.push(`${FILTER}: unsearched customer filter must exhaust the canonical scoped roster while typed search stays server-bounded`);
  }
  if (/listCustomers\(\{[\s\S]{0,180}limit:\s*5000/.test(filter)) {
    problems.push(`${FILTER}: retains a silent 5,000-row customer cap`);
  }
  return problems;
}

export function collectProblems(root = ROOT) {
  return collectSourceProblems(
    fs.readFileSync(path.join(root, FILTER), "utf8"),
    fs.readFileSync(path.join(root, DISPATCH), "utf8"),
  );
}

if (process.argv.includes("--selftest")) {
  const filter = fs.readFileSync(path.join(ROOT, FILTER), "utf8");
  const dispatch = fs.readFileSync(path.join(ROOT, DISPATCH), "utf8");
  if (collectSourceProblems(filter, dispatch).length) throw new Error("clean dispatch filter rejected");
  const mutations = [
    filter.replace("listAllCustomers({", "listCustomers({"),
    filter.replace("limit: 200", "limit: 5000"),
    filter.replace("search: customerSearch", "search: undefined"),
  ];
  for (const [index, mutated] of mutations.entries()) {
    if (mutated === filter || collectSourceProblems(mutated, dispatch).length === 0) {
      throw new Error(`customer-filter mutation ${index + 1} escaped`);
    }
  }
  console.log(LABEL, "SELFTEST OK — 3/3 complete-roster/search mutations red");
  process.exit(0);
}
const p = collectProblems();
if (p.length) { console.error(LABEL, "FAIL", p.join("\n")); process.exit(1); }
console.log(LABEL, "OK");
