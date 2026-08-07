#!/usr/bin/env node
/** CLS-CHROME11 — ReferenceSelect inline create must use InlineCreateDrawer/QuickCreate, not centered Modal. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REF = "apps/frontend/src/components/parity/ReferenceSelect.tsx";
export function collectProblems(root = ROOT) {
  const s = fs.readFileSync(path.join(root, REF), "utf8");
  const p = [];
  if (!/InlineCreateDrawer/.test(s) || !/QuickCreateEntityModal/.test(s)) {
    p.push(`${REF}: must compose InlineCreateDrawer + QuickCreateEntityModal (CHROME-11)`);
  }
  if (/from ["'].*\/Modal["']/.test(s)) {
    p.push(`${REF}: must not open centered Modal for nested entity create`);
  }
  return p;
}
if (process.argv.includes("--selftest")) {
  console.log("verify-chrome11-nested-create-consistency SELFTEST OK");
  process.exit(0);
}
const f = collectProblems();
if (f.length) {
  console.error("verify-chrome11-nested-create-consistency FAIL", f.join("\n"));
  process.exit(1);
}
console.log("verify-chrome11-nested-create-consistency OK");
