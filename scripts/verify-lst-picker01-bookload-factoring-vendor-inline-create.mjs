#!/usr/bin/env node
/**
 * LST-PICKER-01 slice — BookLoadModalV4 factoring company must use ReferenceSelect
 * createKind=vendor (same-table write to mdata.vendors). Cursor even claim: 2098.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-lst-picker01-bookload-factoring-vendor-inline-create";
const PAGE = "apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx";
const REGISTRY = "apps/frontend/src/components/parity/catalogPickerRegistry.ts";

function readRel(root, rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

/** @returns {string[]} */
export function collectProblems(root = ROOT) {
  const problems = [];
  const page = readRel(root, PAGE);
  const registry = readRel(root, REGISTRY);

  if (!page) problems.push(`missing ${PAGE}`);
  else {
    const code = page.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    // Factoring company block must use createKind=vendor (not only customer ReferenceSelect).
    if (!/factoring_company_vendor_id[\s\S]{0,800}createKind=["']vendor["']/.test(code)) {
      problems.push(`${PAGE}: factoring company must use createKind=vendor near factoring_company_vendor_id`);
    }
    if (
      /factoring_company_vendor_id[\s\S]{0,500}SelectCombobox[\s\S]{0,400}factoringVendorOptions\.map/.test(code) ||
      /SelectCombobox[\s\S]{0,200}factoring_company_vendor_id/.test(code)
    ) {
      problems.push(`${PAGE}: must not keep SelectCombobox dual path for factoring company`);
    }
  }

  if (!registry) problems.push(`missing ${REGISTRY}`);
  else if (!/vendor:\s*\{/.test(registry) || !/writeTable:\s*"mdata\.vendors"/.test(registry)) {
    problems.push(`${REGISTRY}: vendor entry must write mdata.vendors`);
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
  const stubRoot = fs.mkdtempSync(path.join(ROOT, ".tmp-lst-picker01-bookload-factor-"));
  try {
    const dir = path.join(stubRoot, "apps/frontend/src/pages/dispatch/components");
    const regDir = path.join(stubRoot, "apps/frontend/src/components/parity");
    fs.mkdirSync(dir, { recursive: true });
    fs.mkdirSync(regDir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "BookLoadModalV4.tsx"),
      `export function BookLoadModalV4() {
  return (
    <SelectCombobox value={factoring_company_vendor_id}>
      {factoringVendorOptions.map((o) => <option key={o.value}>{o.label}</option>)}
    </SelectCombobox>
  );
}
`
    );
    fs.copyFileSync(path.join(ROOT, REGISTRY), path.join(regDir, "catalogPickerRegistry.ts"));
    const planted = collectProblems(stubRoot);
    if (!planted.some((p) => /createKind=vendor/.test(p))) {
      console.error(`${LABEL} SELFTEST FAIL: planted SelectCombobox stub did not FAIL`);
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
  console.log(`${LABEL} OK — BookLoad factoring company vendor inline create`);
}
