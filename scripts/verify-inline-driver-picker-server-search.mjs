#!/usr/bin/env node
/** InlineDriverPicker — EntityPicker kind=driver (server search via registry, not silent listDrivers limit:200). Claim 2146. */
import fs from "node:fs";
import os from "node:os";
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
  if (!/EntityPicker[\s\S]*?kind=["']driver["']/.test(code)) {
    problems.push(`${FILE}: must use EntityPicker kind=driver`);
  }
  if (/listDrivers\s*\(/.test(code) || /limit:\s*200/.test(code) || /limit:\s*500/.test(code)) {
    problems.push(`${FILE}: must not silent-fetch listDrivers limit:200/500 — use EntityPicker kind=driver`);
  }
  if (/from\s+["'][^"']*Combobox["']/.test(code) && !/EntityPicker/.test(code)) {
    problems.push(`${FILE}: must not use raw Combobox for driver roster`);
  }
  return problems;
}
if (process.argv.includes("--selftest")) {
  const baseline = collectProblems();
  if (baseline.length) { console.error(LABEL, "SELFTEST FAIL", baseline); process.exit(1); }
  const tmpStubRoot = fs.mkdtempSync(path.join(os.tmpdir(), ".tmp-inline-drv-"));
  try {
    const tmpStubDir = path.join(tmpStubRoot, "apps/frontend/src/components/dispatch");
    fs.mkdirSync(tmpStubDir, { recursive: true });
    fs.writeFileSync(path.join(tmpStubDir, "InlineDriverPicker.tsx"), `listDrivers({ limit: 200 })\nqueryKey: ["dispatch","inline-drivers",operatingCompanyId]\n`);
    if (!collectProblems(tmpStubRoot).length) { console.error("planted miss"); process.exit(1); }
  } finally { fs.rmSync(tmpStubRoot, { recursive: true, force: true }); }
  console.log(LABEL, "SELFTEST OK");
} else {
  const problems = collectProblems();
  if (problems.length) { console.error(LABEL, "FAIL", problems); process.exit(1); }
  console.log(LABEL, "OK");
}
