#!/usr/bin/env node
/** UnifiedContractCreatorModal — customer ReferenceSelect + server search. Claim 2154. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-contract-creator-customer-search";
const FILE = "apps/frontend/src/pages/legal/contracts/UnifiedContractCreatorModal.tsx";
function readRel(root, rel) {
  const p = path.join(root, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}
export function collectProblems(root = ROOT) {
  const problems = [];
  const src = readRel(root, FILE);
  if (!src) return [`missing ${FILE}`];
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  if (!/createKind=["']customer["']/.test(code)) problems.push(`${FILE}: must ReferenceSelect createKind=customer`);
  if (!/customerSearch/.test(code) || !/search:\s*customerSearch/.test(code)) {
    problems.push(`${FILE}: listCustomers must pass search: customerSearch`);
  }
  if (!/onSearch=\{setCustomerSearch\}/.test(src)) problems.push(`${FILE}: must wire onSearch={setCustomerSearch}`);
  // Customer party must not be a bare SelectCombobox of options
  if (/signerType === "customer"[\s\S]{0,800}<SelectCombobox/.test(src)) {
    problems.push(`${FILE}: customer party must not use SelectCombobox`);
  }
  return problems;
}
if (process.argv.includes("--selftest")) {
  const baseline = collectProblems();
  if (baseline.length) { console.error(LABEL, baseline); process.exit(1); }
  const stubRoot = fs.mkdtempSync(path.join(ROOT, ".tmp-contract-cust-"));
  try {
    const dir = path.join(stubRoot, "apps/frontend/src/pages/legal/contracts");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "UnifiedContractCreatorModal.tsx"),
      `signerType === "customer"\n<SelectCombobox>{customerPartyOptions.map()}</SelectCombobox>\nlistCustomers({ operating_company_id })\n`);
    if (!collectProblems(stubRoot).length) { console.error("plant miss"); process.exit(1); }
  } finally { fs.rmSync(stubRoot, { recursive: true, force: true }); }
  console.log(LABEL, "SELFTEST OK");
} else {
  const problems = collectProblems();
  if (problems.length) { console.error(LABEL, problems); process.exit(1); }
  console.log(LABEL, "OK");
}
