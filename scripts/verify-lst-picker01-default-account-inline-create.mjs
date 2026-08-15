#!/usr/bin/env node
/**
 * LST-PICKER-01 — Vendor/Customer Option-B default expense|income account pickers were bare
 * SelectCombobox/Combobox. Wire createKind=account (parity QuickCreateEntityModal).
 *
 * Surfaces: VendorDetail, VendorCreateModal, CustomerProfileForm.
 * Cursor even claim: 1888.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-lst-picker01-default-account-inline-create";

const FILES = {
  vendorDetail: "apps/frontend/src/pages/VendorDetail.tsx",
  vendorCreate: "apps/frontend/src/components/vendors/VendorCreateModal.tsx",
  customer: "apps/frontend/src/components/customers/CustomerProfileForm.tsx",
  quickCreate: "apps/frontend/src/components/forms/shared/QuickCreateEntityModal.tsx",
  itemEditor: "apps/frontend/src/pages/lists/accounting/ItemEditorModal.tsx",
};

function readRel(root, rel, overrides) {
  if (overrides && Object.prototype.hasOwnProperty.call(overrides, rel)) return overrides[rel];
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function block(src, testid) {
  const m = src.match(new RegExp(`data-testid=["']${testid}["'][\\s\\S]{0,1400}`));
  return m ? m[0] : "";
}

export function collectProblems(root = ROOT, overrides = null) {
  const problems = [];
  const vd = readRel(root, FILES.vendorDetail, overrides);
  const vc = readRel(root, FILES.vendorCreate, overrides);
  const cu = readRel(root, FILES.customer, overrides);
  const qc = readRel(root, FILES.quickCreate, overrides);

  if (!vd) problems.push(`missing ${FILES.vendorDetail}`);
  else {
    const blk = stripComments(block(vd, "vendor-default-expense-account"));
    if (!blk) problems.push(`${FILES.vendorDetail}: missing data-testid=vendor-default-expense-account`);
    if (!/createKind=["']account["']/.test(blk)) problems.push(`${FILES.vendorDetail}: must use createKind=account`);
    if (!/ReferenceSelect/.test(blk)) problems.push(`${FILES.vendorDetail}: must use ReferenceSelect`);
    if (/SelectCombobox/.test(blk)) problems.push(`${FILES.vendorDetail}: must not use bare SelectCombobox`);
  }

  if (!vc) problems.push(`missing ${FILES.vendorCreate}`);
  else {
    const blk = stripComments(block(vc, "vendor-create-default-expense-account"));
    if (!blk) problems.push(`${FILES.vendorCreate}: missing data-testid=vendor-create-default-expense-account`);
    if (!/createKind=["']account["']/.test(blk)) problems.push(`${FILES.vendorCreate}: must use createKind=account`);
    if (/<Combobox[\s>]/.test(blk)) problems.push(`${FILES.vendorCreate}: must not use bare Combobox`);
  }

  if (!cu) problems.push(`missing ${FILES.customer}`);
  else {
    const blk = stripComments(block(cu, "customer-default-income-account"));
    if (!blk) problems.push(`${FILES.customer}: missing data-testid=customer-default-income-account`);
    if (!/createKind=["']account["']/.test(blk)) problems.push(`${FILES.customer}: must use createKind=account`);
    if (/<Combobox[\s>]/.test(blk)) problems.push(`${FILES.customer}: must not use bare Combobox`);
  }

  // PICKER-QUICK-CREATE-ENTITY-KIND-TYPE-DRIFT / LST-F3368: when QuickCreate's kind === "item"
  // early-returns to the embedded canonical ItemEditorModal (already the parity anchor for
  // account income/expense inline-create — see verify-lst-picker01-quickcreate-item-account-
  // inline-create.mjs), the residual QuickCreate form no longer carries its own literal
  // createKind="account" — the anchor lives on ItemEditorModal instead.
  const qcCode = qc ? stripComments(qc) : "";
  const embedsItemEditor =
    /kind\s*===\s*["']item["']/.test(qcCode) && /<ItemEditorModal[\s>]/.test(qcCode) && /\bembedded\b/.test(qcCode);
  if (embedsItemEditor) {
    const ie = readRel(root, FILES.itemEditor, overrides);
    if (!ie) problems.push(`missing ${FILES.itemEditor} (QuickCreateEntityModal embeds ItemEditorModal)`);
    else if (!/createKind=["']account["']/.test(ie)) {
      problems.push(`${FILES.itemEditor}: must keep createKind=account (parity anchor, embedded via QuickCreateEntityModal)`);
    }
  } else if (qc && !/createKind=["']account["']/.test(qc)) {
    problems.push(`${FILES.quickCreate}: must keep createKind=account (parity anchor)`);
  }

  return problems;
}

function main() {
  const problems = collectProblems();
  if (problems.length) {
    console.error(`${LABEL}: FAIL`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS`);
}

function selftest() {
  const fp = path.join(ROOT, FILES.vendorDetail);
  const original = fs.readFileSync(fp, "utf8");
  const planted = original.replace(/createKind=["']account["']/g, 'createKind="vendor"');
  fs.writeFileSync(fp, planted);
  try {
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { cwd: ROOT, encoding: "utf8" });
    if (r.status === 0) throw new Error("selftest expected FAIL");
    console.log(`${LABEL}: selftest PASS`);
  } finally {
    fs.writeFileSync(fp, original);
  }
}

if (process.argv.includes("--selftest")) selftest();
else main();
