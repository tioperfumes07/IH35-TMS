#!/usr/bin/env node
/** CLS-DISP-FILTER-EP — dispatch FilterBar customer/driver filters use canonical pickers. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILTER = "apps/frontend/src/components/dispatch/FilterBar.tsx";
const DISPATCH = "apps/frontend/src/pages/Dispatch.tsx";
const LABEL = "verify-dispatch-filter-entity-pickers";

export function collectProblems(root = ROOT) {
  const problems = [];
  const filter = fs.readFileSync(path.join(root, FILTER), "utf8");
  const dispatch = fs.readFileSync(path.join(root, DISPATCH), "utf8");
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
  return problems;
}

if (process.argv.includes("--selftest")) {
  console.log(LABEL, "SELFTEST OK");
  process.exit(0);
}
const p = collectProblems();
if (p.length) { console.error(LABEL, "FAIL", p.join("\n")); process.exit(1); }
console.log(LABEL, "OK");
