#!/usr/bin/env node
/**
 * LST-PICKER-01 — QuickCreateEntityModal kind=item income/expense were bare Combobox.
 * Wire createKind=account (parity ItemEditorModal / NewServiceDrawerForm).
 *
 * LST-F3368 / PICKER-QUICK-CREATE-ENTITY-KIND-TYPE-DRIFT: when QuickCreate early-returns
 * to embedded ItemEditorModal, the account createKind ratchet lives on ItemEditorModal
 * (canonical Lists chrome) — residual QuickCreate must not keep a dual item form.
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

function embedsItemEditor(src) {
  const code = stripComments(src);
  return /kind\s*===\s*["']item["']/.test(code) && /<ItemEditorModal[\s>]/.test(code) && /\bembedded\b/.test(code);
}

function assertAccountCreateKind(rel, src, problems) {
  if (!/createKind=["']account["']/.test(src)) {
    problems.push(`${rel}: must keep createKind=account (parity anchor)`);
  }
  if (/<Combobox[\s>]/.test(src) && !/ReferenceSelect/.test(src)) {
    problems.push(`${rel}: must not regress income/expense to bare Combobox without ReferenceSelect`);
  }
}

export function collectProblems(root = ROOT, overrides = null) {
  const problems = [];
  const file = readRel(root, FILE, overrides);
  const editor = readRel(root, EDITOR, overrides);
  if (!file) return [`missing ${FILE}`];

  // PICKER-QUICK-CREATE-ENTITY-KIND-TYPE-DRIFT — residual drawer after vendor/item/class
  // early-returns must not compare kind to "vendor"/"item" (TS2367 after narrowing).
  {
    const code = stripComments(file);
    const residualIdx = code.indexOf('data-testid="quick-create-entity-drawer"');
    if (residualIdx >= 0) {
      const residual = code.slice(residualIdx);
      if (/kind\s*===\s*["']vendor["']/.test(residual)) {
        problems.push(`${FILE}: residual quick-create form must not compare kind === "vendor" (dead after VendorCreateModal early-return)`);
      }
      if (/kind\s*===\s*["']item["']/.test(residual)) {
        problems.push(`${FILE}: residual quick-create form must not compare kind === "item" (dead after ItemEditorModal early-return)`);
      }
    }
  }

  if (embedsItemEditor(file)) {
    if (!editor) problems.push(`missing ${EDITOR} (QuickCreateEntityModal embeds ItemEditorModal)`);
    else assertAccountCreateKind(EDITOR, stripComments(editor), problems);
  } else {
    for (const testid of ["quick-create-item-income-account", "quick-create-item-expense-account"]) {
      const blk = stripComments(block(file, testid));
      if (!blk) problems.push(`${FILE}: missing data-testid=${testid}`);
      else {
        if (!/ReferenceSelect/.test(blk)) problems.push(`${FILE}: ${testid} must use ReferenceSelect`);
        if (!/createKind=["']account["']/.test(blk)) problems.push(`${FILE}: ${testid} must use createKind=account`);
        if (/<Combobox[\s>]/.test(blk)) problems.push(`${FILE}: ${testid} must not use bare Combobox`);
      }
    }
  }

  // Persist keys may live on QuickCreate submit OR on ItemEditorModal create payload.
  const persistSrc = embedsItemEditor(file) && editor ? `${file}\n${editor}` : file;
  if (!/default_income_account_id/.test(persistSrc) || !/default_expense_account_id/.test(persistSrc)) {
    problems.push(`${FILE}: must still persist default_income_account_id / default_expense_account_id`);
  }

  if (editor && !embedsItemEditor(file)) {
    assertAccountCreateKind(EDITOR, stripComments(editor), problems);
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
  const baseline = collectProblems();
  if (baseline.length) {
    console.error(`${LABEL} SELFTEST FAIL (baseline must be clean):`);
    for (const p of baseline) console.error("  - " + p);
    process.exit(1);
  }

  const quick = fs.readFileSync(path.join(ROOT, FILE), "utf8");
  const targetRel = embedsItemEditor(quick) ? EDITOR : FILE;
  const targetPath = path.join(ROOT, targetRel);
  const original = fs.readFileSync(targetPath, "utf8");
  const planted = embedsItemEditor(quick)
    ? original.replace(/createKind=["']account["']/g, 'createKind="vendor"')
    : original.replace(
        /data-testid=["']quick-create-item-income-account["'][\s\S]{0,800}?createKind=["']account["']/,
        (m) => m.replace(/createKind=["']account["']/, 'createKind="vendor"')
      );
  if (planted === original) {
    console.error(`${LABEL} SELFTEST FAIL: inert mutation on ${targetRel}`);
    process.exit(1);
  }
  fs.writeFileSync(targetPath, planted);
  try {
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { cwd: ROOT, encoding: "utf8" });
    if (r.status === 0) throw new Error("selftest expected FAIL");
    console.log(`${LABEL}: selftest PASS`);
  } finally {
    fs.writeFileSync(targetPath, original);
  }
}

if (process.argv.includes("--selftest")) selftest();
else main();
