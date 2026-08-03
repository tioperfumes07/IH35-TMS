#!/usr/bin/env node
/** SettlementDisputeModal — DriverPickerWithCreate (not silent listDrivers 200). Claim 2152. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlement-dispute-driver-picker";
const FILE = "apps/frontend/src/pages/drivers/SettlementDisputeModal.tsx";
function readRel(root, rel) {
  const p = path.join(root, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}
export function collectProblems(root = ROOT) {
  const problems = [];
  const src = readRel(root, FILE);
  if (!src) return [`missing ${FILE}`];
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  if (!/DriverPickerWithCreate/.test(code)) problems.push(`${FILE}: must use DriverPickerWithCreate`);
  if (/listDrivers\(/.test(code)) problems.push(`${FILE}: must not call listDrivers`);
  if (/limit:\s*200/.test(code) && /listDrivers/.test(src)) problems.push(`${FILE}: silent listDrivers limit:200`);
  return problems;
}
if (process.argv.includes("--selftest")) {
  const baseline = collectProblems();
  if (baseline.length) { console.error(LABEL, baseline); process.exit(1); }
  const stubRoot = fs.mkdtempSync(path.join(ROOT, ".tmp-dispute-drv-"));
  try {
    const dir = path.join(stubRoot, "apps/frontend/src/pages/drivers");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "SettlementDisputeModal.tsx"), `listDrivers({ limit: 200 })\n<Combobox options={driverOptions} />\n`);
    if (!collectProblems(stubRoot).length) { console.error("plant miss"); process.exit(1); }
  } finally { fs.rmSync(stubRoot, { recursive: true, force: true }); }
  console.log(LABEL, "SELFTEST OK");
} else {
  const problems = collectProblems();
  if (problems.length) { console.error(LABEL, problems); process.exit(1); }
  console.log(LABEL, "OK");
}
