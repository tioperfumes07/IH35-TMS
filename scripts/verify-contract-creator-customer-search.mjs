#!/usr/bin/env node
/** UnifiedContractCreatorModal — customer ReferenceSelect + server search. Claim 2154. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-contract-creator-customer-search";
const FILE = "apps/frontend/src/pages/legal/contracts/UnifiedContractCreatorModal.tsx";
const CATALOG_FILE = "apps/frontend/src/components/legal/CatalogReferenceSelect.tsx";
function readRel(root, rel) {
  const p = path.join(root, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}
// CC-2 GUARD 2026-08-19: re-anchored. The original ReferenceSelect + locally-debounced
// listCustomers(search: customerSearch) implementation this guard checked for was replaced —
// per the in-code CLS-SILENT-CAP comment — with the canonical EntityPicker, which does its own
// real server-search internally and has no capped local roster to silently truncate. The old
// checks (createKind=customer, customerSearch/listCustomers wiring, onSearch={setCustomerSearch})
// all check for source text that no longer exists anywhere in this file; re-anchored to the real,
// strictly more honest current implementation instead of the retired one.
export function collectProblems(root = ROOT) {
  const problems = [];
  const src = readRel(root, FILE);
  if (!src) return [`missing ${FILE}`];
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  // Independently converged fix (CC-2 had a narrower 2-check re-anchor; kept this already-
  // integrated version — accepts either contract and checks 4 real EntityPicker attributes).
  const referenceSelectContract =
    /createKind=["']customer["']/.test(code) &&
    /customerSearch/.test(code) &&
    /search:\s*customerSearch/.test(code) &&
    /onSearch=\{setCustomerSearch\}/.test(src);
  // EntityPicker is the newer canonical entity abstraction. Its customer registry owns the
  // company-scoped server search and real inline creator, so requiring each consumer to duplicate
  // listCustomers/customerSearch would actively defeat the shared picker contract.
  const entityPickerContract =
    /<EntityPicker[\s\S]{0,500}kind=["']customer["'][\s\S]{0,500}allowCreate/.test(code) &&
    /operatingCompanyId=\{operatingCompanyId\}/.test(code) &&
    /value=\{signerEntityId \|\| null\}/.test(code) &&
    /onChange=\{\(id, option\) =>/.test(code);
  // ROUND 316 (CC-1): the contract pages' canonical CatalogReferenceSelect — accepted only while the component
  // itself does company-scoped SERVER search (onSearch -> listCustomers search) with inline create; a capped
  // local roster fails this contract exactly like the retired one.
  const catalogSrc = readRel(root, CATALOG_FILE) ?? "";
  const catalogContract =
    /<CatalogReferenceSelect[\s\S]{0,300}kind=["']customer["'][\s\S]{0,300}allowCreate/.test(code) &&
    /operatingCompanyId=\{operatingCompanyId\}/.test(code) &&
    /value=\{signerEntityId \|\| null\}/.test(code) &&
    /onChange=\{\(id, option\) =>/.test(code) &&
    /onSearch=\{setPartySearch\}/.test(catalogSrc) &&
    /listCustomers\(params\)/.test(catalogSrc) &&
    /search:\s*debouncedSearch/.test(catalogSrc) &&
    /operating_company_id:\s*operatingCompanyId/.test(catalogSrc) &&
    /createKind=\{kind\}/.test(catalogSrc);
  if (!referenceSelectContract && !entityPickerContract && !catalogContract) {
    problems.push(`${FILE}: customer signer must use a company-scoped searchable canonical picker with inline create`);
  }
  // Customer party must not be a bare SelectCombobox of options
  if (/signerType === "customer"[\s\S]{0,800}<SelectCombobox/.test(src)) {
    problems.push(`${FILE}: customer party must not use SelectCombobox`);
  }
  return problems;
}
if (process.argv.includes("--selftest")) {
  const baseline = collectProblems();
  if (baseline.length) { console.error(LABEL, baseline); process.exit(1); }
  const tmpStubRoot = fs.mkdtempSync(path.join(os.tmpdir(), ".tmp-contract-cust-"));
  try {
    const tmpStubDir = path.join(tmpStubRoot, "apps/frontend/src/pages/legal/contracts");
    fs.mkdirSync(tmpStubDir, { recursive: true });
    fs.writeFileSync(path.join(tmpStubDir, "UnifiedContractCreatorModal.tsx"),
      `signerType === "customer"\n<SelectCombobox>{customerPartyOptions.map()}</SelectCombobox>\nlistCustomers({ operating_company_id })\n`);
    if (!collectProblems(tmpStubRoot).length) { console.error("plant miss"); process.exit(1); }
    // CatalogReferenceSelect usage over a capped local roster (no server search) must fail.
    fs.writeFileSync(path.join(tmpStubDir, "UnifiedContractCreatorModal.tsx"),
      `<CatalogReferenceSelect kind="customer" allowCreate operatingCompanyId={operatingCompanyId} value={signerEntityId || null} onChange={(id, option) => {}} />\n`);
    const tmpStubCdir = path.join(tmpStubRoot, "apps/frontend/src/components/legal");
    fs.mkdirSync(tmpStubCdir, { recursive: true });
    fs.writeFileSync(path.join(tmpStubCdir, "CatalogReferenceSelect.tsx"),
      `listCustomers({ operating_company_id: operatingCompanyId, limit: 2000 })\n<ReferenceSelect createKind={kind} />\n`);
    if (!collectProblems(tmpStubRoot).length) { console.error("plant miss (capped CatalogReferenceSelect)"); process.exit(1); }
  } finally { fs.rmSync(tmpStubRoot, { recursive: true, force: true }); }
  console.log(LABEL, "SELFTEST OK");
} else {
  const problems = collectProblems();
  if (problems.length) { console.error(LABEL, problems); process.exit(1); }
  console.log(LABEL, "OK");
}
