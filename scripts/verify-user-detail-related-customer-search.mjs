#!/usr/bin/env node
/** UserDetail dispatcher safety — related customer ReferenceSelect + search; no silent listDrivers. Claim 2158. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-user-detail-related-customer-search";
const FILE = "apps/frontend/src/pages/UserDetail.tsx";
function readRel(root, rel) {
  const p = path.join(root, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}
export function collectProblems(root = ROOT) {
  const problems = [];
  const src = readRel(root, FILE);
  if (!src) return [`missing ${FILE}`];
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  if (!/createKind=["']customer["']/.test(code)) problems.push(`${FILE}: related customer must ReferenceSelect createKind=customer`);
  if (!/customerSearch/.test(code) || !/search:\s*customerSearch/.test(code)) {
    problems.push(`${FILE}: listCustomers must pass search: customerSearch`);
  }
  if (/listDrivers\(/.test(code)) problems.push(`${FILE}: must not silent-fetch listDrivers (use DriverPickerWithCreate)`);
  if (!/DriverPickerWithCreate/.test(code)) problems.push(`${FILE}: related driver must use DriverPickerWithCreate`);
  return problems;
}
if (process.argv.includes("--selftest")) {
  const baseline = collectProblems();
  if (baseline.length) { console.error(LABEL, baseline); process.exit(1); }
  const stubRoot = fs.mkdtempSync(path.join(ROOT, ".tmp-user-detail-"));
  try {
    const dir = path.join(stubRoot, "apps/frontend/src/pages");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "UserDetail.tsx"), `listDrivers({ limit: 200 })\nlistCustomers()\n<Combobox options={customerOptions} />\n`);
    if (!collectProblems(stubRoot).length) { console.error("plant miss"); process.exit(1); }
  } finally { fs.rmSync(stubRoot, { recursive: true, force: true }); }
  console.log(LABEL, "SELFTEST OK");
} else {
  const problems = collectProblems();
  if (problems.length) { console.error(LABEL, problems); process.exit(1); }
  console.log(LABEL, "OK");
}
