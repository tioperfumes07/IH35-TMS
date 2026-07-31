#!/usr/bin/env node
/**
 * LST-PICKER-01 — AccountDrawer parent account was a bare Combobox (no first-row +Create)
 * while NewAccountDrawerForm already has createKind=account (guard 1884). Dual-path close.
 *
 * Cursor even claim: 1886.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-lst-picker01-account-drawer-parent-inline-create";
const PAGE = "apps/frontend/src/pages/lists/accounting/AccountDrawer.tsx";
const NEW = "apps/frontend/src/components/parity/drawers/NewAccountDrawerForm.tsx";

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
  const page = readRel(root, PAGE, overrides);
  const neu = readRel(root, NEW, overrides);
  if (!page) return [`missing ${PAGE}`];
  if (!/data-testid=["']parent-account-picker["']/.test(page)) {
    problems.push(`${PAGE}: must keep data-testid=parent-account-picker`);
  }
  const blk = stripComments(block(page, "parent-account-picker"));
  if (!/ReferenceSelect/.test(blk)) problems.push(`${PAGE}: parent must use ReferenceSelect`);
  if (!/createKind=["']account["']/.test(blk)) problems.push(`${PAGE}: parent must use createKind=account`);
  if (/<Combobox[\s>]/.test(blk)) problems.push(`${PAGE}: parent must not use bare Combobox`);
  if (!/parent_account_id/.test(page)) problems.push(`${PAGE}: must still persist parent_account_id`);
  if (neu && !/createKind=["']account["']/.test(neu)) {
    problems.push(`${NEW}: must keep createKind=account (1884 parity anchor)`);
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
  const fp = path.join(ROOT, PAGE);
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
