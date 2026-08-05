#!/usr/bin/env node
/** CLS-SETTLE-DISPUTE-DRIVER-EP — EntityPicker kind=driver. Cursor even claim: 2472. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlement-dispute-driver-entity-picker";
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
  if (!/EntityPicker[\s\S]*?kind=["']driver["']/.test(code)) problems.push(`${FILE}: must use EntityPicker kind=driver`);
  if (/DriverPickerWithCreate/.test(code)) problems.push(`${FILE}: must not use DriverPickerWithCreate`);
  if (/listDrivers\s*\(/.test(code)) problems.push(`${FILE}: must not call listDrivers`);
  return problems;
}
if (process.argv.includes("--selftest")) {
  const baseline = collectProblems();
  if (baseline.length) { console.error(LABEL, baseline); process.exit(1); }
  const stubRoot = fs.mkdtempSync(path.join(ROOT, ".tmp-settlement-dispute-driver-entity-picker-"));
  try {
    const dir = path.join(stubRoot, path.dirname(FILE));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(stubRoot, FILE), `<DriverPickerWithCreate />\nlistDrivers({ limit: 200 })`);
    if (!collectProblems(stubRoot).length) { console.error("plant miss"); process.exit(1); }
  } finally { fs.rmSync(stubRoot, { recursive: true, force: true }); }
  console.log(LABEL, "SELFTEST OK");
} else {
  const problems = collectProblems();
  if (problems.length) { console.error(LABEL, problems); process.exit(1); }
  console.log(LABEL, "OK");
}
