#!/usr/bin/env node
/**
 * verify-banking-inline-create.mjs
 *
 * Design-law §7 (the universal inline "+ Add new ___" create law) for the Banking CATEGORIZATION
 * dropdowns in apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx.
 *
 * Owner-observed defect: the categorize-row dropdowns lacked the QBO-style inline "+ Add new" that opens
 * a mini-create writing the CANONICAL TMS catalog (never QuickBooks — reconcile-only). The reusable
 * keystone already exists: components/parity/ReferenceSelect.tsx (createKind → an existing canonical
 * create endpoint). This guard is a REGRESSION guard on the categorize-row dropdowns that DO ship the
 * inline-create, so they "stay fixed":
 *
 *   - Payee (vendor)          → ReferenceSelect createKind="vendor"   (mdata.vendors)
 *   - Category (Chart of Accts)→ ReferenceSelect createKind="category" (catalogs.accounts)
 *   - Item (Products&Services) → ReferenceSelect createKind="service"  (catalogs.items)
 *   - Customer/project         → ReferenceSelect createKind="customer" (mdata.customers)
 *   - Class                    → ReferenceSelect createKind="class"    (catalogs.classes)  ← this block (#5)
 *
 * It ALSO asserts that QuickCreateEntityModal actually SUPPORTS the "class" kind AND has a real
 * classesCatalogClient create branch (so the Class picker's "+ Add new class" is WIRED, not a stub), and
 * that the Class field is no longer a bare free-text <input> in the categorize row.
 *
 * NON-financial only: vendor/customer/item/class write reference catalogs (mdata.* / catalogs.items /
 * catalogs.classes) with no GL/posting math. The category (catalogs.accounts) inline-create shipped in a
 * prior PR; the COA-account "+ New" nested inside the item/service wizard stays owner-GATED (financial).
 *
 * Usage:
 *   node scripts/verify-banking-inline-create.mjs            # scan real files
 *   node scripts/verify-banking-inline-create.mjs --selftest # inject regressions -> must FAIL
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-banking-inline-create";

const DESIGN_VIEW = "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx";
const QUICK_CREATE = "apps/frontend/src/components/forms/shared/QuickCreateEntityModal.tsx";

// Each categorize-row dropdown that MUST keep its inline "+ Add new" (ReferenceSelect + createKind).
const REQUIRED_CREATE_KINDS = ["vendor", "category", "customer", "service", "class"];

function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/**
 * Pure evaluation.
 * @param {{ designView: string, quickCreate: string }} args  raw file text
 * @returns {string[]} errors
 */
export function assertGuard({ designView, quickCreate }) {
  const errors = [];
  const dv = stripComments(designView);
  const qc = stripComments(quickCreate);

  if (!/\bReferenceSelect\b/.test(dv)) {
    errors.push(`${DESIGN_VIEW}: no <ReferenceSelect> in the categorize row (inline "+ Add new" lost)`);
  }
  for (const kind of REQUIRED_CREATE_KINDS) {
    const re = new RegExp(`createKind=["']${kind}["']`);
    if (!re.test(dv)) {
      errors.push(`${DESIGN_VIEW}: categorize dropdown lost inline-create createKind="${kind}"`);
    }
  }

  // Class (#5) specifically must be a ReferenceSelect, NOT a bare free-text <input value={draft.className}>.
  if (/<input[^>]*value=\{draft\.className\}/.test(dv)) {
    errors.push(`${DESIGN_VIEW}: Class is still a bare <input> (must be ReferenceSelect createKind="class")`);
  }

  // QuickCreateEntityModal must actually SUPPORT the class kind (type union) AND have a real create branch
  // that writes the canonical catalogs.classes via classesCatalogClient — else the picker's "+ Add new
  // class" is a stub that 400s.
  if (!/QuickCreateKind\s*=[^;]*["']class["']/.test(qc)) {
    errors.push(`${QUICK_CREATE}: "class" missing from the QuickCreateKind union`);
  }
  if (!/kind === ["']class["']/.test(qc) || !/classesCatalogClient\.create/.test(qc)) {
    errors.push(`${QUICK_CREATE}: no classesCatalogClient.create branch for kind="class" (inline create is a stub)`);
  }

  return errors;
}

function readReal(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return null;
  return fs.readFileSync(abs, "utf8");
}

function selftest() {
  const goodDesignView = `
    <ReferenceSelect createKind="vendor" />
    <ReferenceSelect createKind="category" />
    <ReferenceSelect createKind="customer" />
    <ReferenceSelect createKind="service" addNewLabel="+ Add new product/service" />
    <ReferenceSelect createKind="class" addNewLabel="+ Add new class" />
  `;
  const goodQuickCreate = `
    export type QuickCreateKind = "vendor" | "customer" | "item" | "category" | "part" | "class";
    // ...
    } else if (kind === "class") {
      const res = await classesCatalogClient.create(operatingCompanyId, { code, display_name });
    }
  `;

  const cases = [
    { name: "all categorize dropdowns wired + class create branch → 0 errors", in: { designView: goodDesignView, quickCreate: goodQuickCreate }, want: 0 },
    { name: "Class dropdown lost createKind=class → FAIL", in: { designView: goodDesignView.replace('createKind="class"', 'createKind="unknown"'), quickCreate: goodQuickCreate }, wantMin: 1 },
    { name: "Class regressed to bare <input value={draft.className}> → FAIL", in: { designView: goodDesignView.replace('<ReferenceSelect createKind="class" addNewLabel="+ Add new class" />', '<input className="x" value={draft.className} />'), quickCreate: goodQuickCreate }, wantMin: 1 },
    { name: "Customer dropdown lost inline-create → FAIL", in: { designView: goodDesignView.replace('createKind="customer"', 'value=""'), quickCreate: goodQuickCreate }, wantMin: 1 },
    { name: "QuickCreateEntityModal missing class kind in union → FAIL", in: { designView: goodDesignView, quickCreate: goodQuickCreate.replace('| "part" | "class"', '| "part"') }, wantMin: 1 },
    { name: "QuickCreateEntityModal class branch is a stub (no classesCatalogClient.create) → FAIL", in: { designView: goodDesignView, quickCreate: goodQuickCreate.replace("await classesCatalogClient.create(operatingCompanyId, { code, display_name });", "throw new Error('not implemented');") }, wantMin: 1 },
  ];

  let failed = 0;
  for (const c of cases) {
    const errs = assertGuard(c.in);
    const n = errs.length;
    const ok = c.want !== undefined ? n === c.want : n >= c.wantMin;
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"}  ${c.name}  (errors=${n})`);
  }
  if (failed) { console.error(`\n${LABEL} SELFTEST FAILED: ${failed}`); process.exit(1); }
  console.log(`\n${LABEL} SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) { selftest(); process.exit(0); }

const designView = readReal(DESIGN_VIEW);
const quickCreate = readReal(QUICK_CREATE);
if (designView === null) { console.error(`[${LABEL}] FAILED — missing file ${DESIGN_VIEW}`); process.exit(1); }
if (quickCreate === null) { console.error(`[${LABEL}] FAILED — missing file ${QUICK_CREATE}`); process.exit(1); }

const errors = assertGuard({ designView, quickCreate });
if (errors.length) {
  console.error(`[${LABEL}] FAILED — ${errors.length} issue(s):`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — Banking categorize dropdowns (vendor/category/customer/item/class) keep inline "+ Add new" writing the canonical TMS catalog; class create branch is wired (catalogs.classes), not a stub.`);
