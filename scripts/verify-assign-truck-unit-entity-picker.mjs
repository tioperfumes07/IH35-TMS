#!/usr/bin/env node
/** AssignTruckModal — EntityPicker unit (not silent listUnits limit:500 + select). Claim 2150. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-assign-truck-unit-entity-picker";
const FILE = "apps/frontend/src/components/driver-profile/AssignTruckModal.tsx";
function readRel(root, rel) {
  const p = path.join(root, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}
export function collectProblems(root = ROOT) {
  const problems = [];
  const src = readRel(root, FILE);
  if (!src) return [`missing ${FILE}`];
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  if (!/EntityPicker/.test(code) || !/kind=["']unit["']/.test(code)) {
    problems.push(`${FILE}: must use EntityPicker kind="unit"`);
  }
  if (/listUnits\(/.test(code)) problems.push(`${FILE}: must not call listUnits directly`);
  if (/SelectCombobox/.test(code) || /<select[\s>]/.test(code)) {
    problems.push(`${FILE}: must not use SelectCombobox/select for unit`);
  }
  if (/limit:\s*500/.test(code)) problems.push(`${FILE}: must not silent-fetch limit:500`);
  return problems;
}
if (process.argv.includes("--selftest")) {
  const baseline = collectProblems();
  if (baseline.length) { console.error(LABEL, "SELFTEST FAIL", baseline); process.exit(1); }
  const stubRoot = fs.mkdtempSync(path.join(ROOT, ".tmp-assign-truck-"));
  try {
    const dir = path.join(stubRoot, "apps/frontend/src/components/driver-profile");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "AssignTruckModal.tsx"), `listUnits({ limit: 500 })\n<SelectCombobox><option/></SelectCombobox>\n`);
    if (!collectProblems(stubRoot).length) { console.error("planted miss"); process.exit(1); }
  } finally { fs.rmSync(stubRoot, { recursive: true, force: true }); }
  console.log(LABEL, "SELFTEST OK");
} else {
  const problems = collectProblems();
  if (problems.length) { console.error(LABEL, "FAIL", problems); process.exit(1); }
  console.log(LABEL, "OK");
}
