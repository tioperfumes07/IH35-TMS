#!/usr/bin/env node
/**
 * LST-PICKER-01 — QuickCreateEntityModal kind=item income/expense were bare Combobox.
 * Wire createKind=account (parity ItemEditorModal / NewServiceDrawerForm).
 *
 * Cursor even claim: 1890.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-lst-picker01-quickcreate-item-account-inline-create";
const FILE = "apps/frontend/src/components/forms/shared/QuickCreateEntityModal.tsx";
const EDITOR = "apps/frontend/src/pages/lists/accounting/ItemEditorModal.tsx";

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
  const m = src.match(new RegExp(`data-testid=["']${testid}["'][\\s\\S]{0,1200}`));
  return m ? m[0] : "";
}

export function collectProblems(root = ROOT, overrides = null) {
  const problems = [];
  const file = readRel(root, FILE, overrides);
  const editor = readRel(root, EDITOR, overrides);
  if (!file) return [`missing ${FILE}`];

  for (const testid of ["quick-create-item-income-account", "quick-create-item-expense-account"]) {
    const blk = stripComments(block(file, testid));
    if (!blk) problems.push(`${FILE}: missing data-testid=${testid}`);
    else {
      if (!/ReferenceSelect/.test(blk)) problems.push(`${FILE}: ${testid} must use ReferenceSelect`);
      if (!/createKind=["']account["']/.test(blk)) problems.push(`${FILE}: ${testid} must use createKind=account`);
      if (/<Combobox[\s>]/.test(blk)) problems.push(`${FILE}: ${testid} must not use bare Combobox`);
    }
  }

  if (!/default_income_account_id/.test(file) || !/default_expense_account_id/.test(file)) {
    problems.push(`${FILE}: must still persist default_income_account_id / default_expense_account_id`);
  }

  if (editor && !/createKind=["']account["']/.test(editor)) {
    problems.push(`${EDITOR}: must keep createKind=account (parity anchor)`);
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
  const fp = path.join(ROOT, FILE);
  const original = fs.readFileSync(fp, "utf8");
  // Only plant the item income createKind (leave expense + vendor path alone)
  const planted = original.replace(
    /data-testid=["']quick-create-item-income-account["'][\s\S]{0,800}?createKind=["']account["']/,
    (m) => m.replace(/createKind=["']account["']/, 'createKind="vendor"')
  );
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
