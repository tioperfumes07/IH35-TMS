#!/usr/bin/env node
/**
 * LST-PICKER-01 — NewAccountDrawerForm parent account was a bare <select> over
 * catalogs.accounts (FK parent_account_id) with no first-row +Create.
 * Wire ReferenceSelect createKind=account.
 *
 * Cursor even claim: 1884.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-lst-picker01-new-account-parent-inline-create";
const FORM = "apps/frontend/src/components/parity/drawers/NewAccountDrawerForm.tsx";

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
  const m = src.match(new RegExp(`data-testid=["']${testid}["'][\\s\\S]{0,900}`));
  return m ? m[0] : "";
}

export function collectProblems(root = ROOT, overrides = null) {
  const problems = [];
  const form = readRel(root, FORM, overrides);
  if (!form) return [`missing ${FORM}`];
  if (!/data-testid=["']new-account-parent-select["']/.test(form)) {
    problems.push(`${FORM}: must use data-testid=new-account-parent-select`);
  }
  const blk = stripComments(block(form, "new-account-parent-select"));
  if (!/ReferenceSelect/.test(blk)) problems.push(`${FORM}: parent picker must use ReferenceSelect`);
  if (!/createKind=["']account["']/.test(blk)) problems.push(`${FORM}: parent must use createKind=account`);
  if (/<select[\s>]/.test(blk)) problems.push(`${FORM}: parent must not use bare <select>`);
  if (!/parent_account_id|parentAccount/.test(form)) problems.push(`${FORM}: must still persist parent account`);
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
  const fp = path.join(ROOT, FORM);
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
