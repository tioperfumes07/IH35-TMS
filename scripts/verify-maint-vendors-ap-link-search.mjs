#!/usr/bin/env node
/**
 * Maintenance VendorsPage AP-vendor link — ReferenceSelect createKind=vendor + server search.
 * Cursor even claim: 2114.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-maint-vendors-ap-link-search";
const FILE = "apps/frontend/src/pages/maintenance/vendors/VendorsPage.tsx";

function readRel(root, rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

/** @returns {string[]} */
export function collectProblems(root = ROOT) {
  const problems = [];
  const src = readRel(root, FILE);
  if (!src) {
    problems.push(`missing ${FILE}`);
    return problems;
  }
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  if (!/createKind=["']vendor["']/.test(code)) {
    problems.push(`${FILE}: AP vendor link must use ReferenceSelect createKind=vendor`);
  }
  if (!/apVendorSearch/.test(code) || !/onSearch=\{setApVendorSearch\}/.test(code)) {
    problems.push(`${FILE}: AP vendor link must wire apVendorSearch + onSearch`);
  }
  if (/from ["'].*Combobox["']/.test(code) && /mdata_vendor_id/.test(code) && !/ReferenceSelect/.test(code)) {
    problems.push(`${FILE}: must not keep bare Combobox for AP vendor link`);
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const baseline = collectProblems();
  if (baseline.length) {
    console.error(`${LABEL} SELFTEST FAIL:`);
    for (const p of baseline) console.error("  - " + p);
    process.exit(1);
  }
  const stubRoot = fs.mkdtempSync(path.join(ROOT, ".tmp-maint-vendors-"));
  try {
    const dir = path.join(stubRoot, "apps/frontend/src/pages/maintenance/vendors");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "VendorsPage.tsx"),
      `import { Combobox } from "../../../components/shared/Combobox";
listVendors({ operating_company_id: companyId, status: "active", limit: 1000 })
<Combobox options={apVendorOptions} value={draft.mdata_vendor_id} />
`
    );
    const planted = collectProblems(stubRoot);
    if (!planted.length) {
      console.error(`${LABEL} SELFTEST FAIL: planted stub did not FAIL`);
      process.exit(1);
    }
  } finally {
    fs.rmSync(stubRoot, { recursive: true, force: true });
  }
  console.log(`${LABEL} SELFTEST OK`);
} else {
  const problems = collectProblems();
  if (problems.length) {
    console.error(`${LABEL} FAIL:`);
    for (const p of problems) console.error("  - " + p);
    process.exit(1);
  }
  console.log(`${LABEL} OK — maint vendors AP link search`);
}
