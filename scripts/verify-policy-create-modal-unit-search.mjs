#!/usr/bin/env node
/** PolicyCreateModal — covered units use the shared server-search EntityPicker. Claim 2156. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-policy-create-modal-unit-search";
const FILE = "apps/frontend/src/components/insurance/PolicyCreateModal.tsx";
function readRel(root, rel) {
  const p = path.join(root, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}
export function collectProblems(root = ROOT) {
  const problems = [];
  const src = readRel(root, FILE);
  if (!src) return [`missing ${FILE}`];
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  if (/listAllUnits|include:\s*["']trailers["']/.test(code)) problems.push(`${FILE}: must not fork the shared unit roster or include trailers`);
  if (!/<EntityPicker[\s\S]{0,180}kind=["']unit["'][\s\S]{0,260}operatingCompanyId=\{operatingCompanyId\}/.test(code)) problems.push(`${FILE}: must use the company-scoped unit EntityPicker`);
  if (!/policy-create-unit-search/.test(src)) problems.push(`${FILE}: must expose unit search input`);
  return problems;
}
if (process.argv.includes("--selftest")) {
  const baseline = collectProblems();
  if (baseline.length) { console.error(LABEL, baseline); process.exit(1); }
  const stubRoot = fs.mkdtempSync(path.join(ROOT, ".tmp-policy-modal-"));
  try {
    const dir = path.join(stubRoot, "apps/frontend/src/components/insurance");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "PolicyCreateModal.tsx"), `listAllUnits({ include: "trailers", limit: 500 })\n<input data-testid="policy-create-unit-search" />\n`);
    if (!collectProblems(stubRoot).length) { console.error("plant miss"); process.exit(1); }
  } finally { fs.rmSync(stubRoot, { recursive: true, force: true }); }
  console.log(LABEL, "SELFTEST OK");
} else {
  const problems = collectProblems();
  if (problems.length) { console.error(LABEL, problems); process.exit(1); }
  console.log(LABEL, "OK");
}
