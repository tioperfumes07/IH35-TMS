#!/usr/bin/env node
/** InlineDriverPicker — server search (not silent listDrivers limit:200). Claim 2146. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-inline-driver-picker-server-search";
const FILE = "apps/frontend/src/components/dispatch/InlineDriverPicker.tsx";
function readRel(root, rel) {
  const p = path.join(root, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}
export function collectProblems(root = ROOT) {
  const problems = [];
  const src = readRel(root, FILE);
  if (!src) return [`missing ${FILE}`];
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  if (!/driverSearch/.test(code) || !/search:\s*driverSearch/.test(code)) {
    problems.push(`${FILE}: listDrivers must pass search: driverSearch`);
  }
  if (!/onSearch=\{setDriverSearch\}/.test(src) && !/onSearch=\{setDriverSearch\}/.test(code)) {
    problems.push(`${FILE}: Combobox must wire onSearch={setDriverSearch}`);
  }
  if (/queryKey:.*"inline-drivers"[^,\]]*\]/.test(code) && !/driverSearch/.test(code.match(/queryKey:[\s\S]*?\]/)?.[0] ?? "")) {
    problems.push(`${FILE}: queryKey must include driverSearch`);
  }
  if (!/driverSearch\]/.test(code) && !/"driverSearch"/.test(code)) {
    problems.push(`${FILE}: driversQuery key must include driverSearch`);
  }
  return problems;
}
if (process.argv.includes("--selftest")) {
  const baseline = collectProblems();
  if (baseline.length) { console.error(LABEL, "SELFTEST FAIL", baseline); process.exit(1); }
  const stubRoot = fs.mkdtempSync(path.join(ROOT, ".tmp-inline-drv-"));
  try {
    const dir = path.join(stubRoot, "apps/frontend/src/components/dispatch");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "InlineDriverPicker.tsx"), `listDrivers({ limit: 200 })\nqueryKey: ["dispatch","inline-drivers",operatingCompanyId]\n`);
    if (!collectProblems(stubRoot).length) { console.error("planted miss"); process.exit(1); }
  } finally { fs.rmSync(stubRoot, { recursive: true, force: true }); }
  console.log(LABEL, "SELFTEST OK");
} else {
  const problems = collectProblems();
  if (problems.length) { console.error(LABEL, "FAIL", problems); process.exit(1); }
  console.log(LABEL, "OK");
}
