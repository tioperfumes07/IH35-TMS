#!/usr/bin/env node
/**
 * LST-PICKER-01 — PostingTemplateModal default class was a bare SelectCombobox
 * over catalogs.classes with no first-row +Create. Debit/credit already use
 * createKind=account. Wire ReferenceSelect createKind=class (parity DriverDetail 1882).
 *
 * Cursor even claim: 1892.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-lst-picker01-posting-template-class-inline-create";
const PAGE = "apps/frontend/src/pages/lists/accounting/PostingTemplateModal.tsx";

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
  const m = src.match(new RegExp(`data-testid=["']${testid}["'][\\s\\S]{0,1800}`));
  return m ? m[0] : "";
}

/** @returns {string[]} */
export function collectProblems(root = ROOT, overrides = null) {
  const problems = [];
  const page = readRel(root, PAGE, overrides);
  if (!page) {
    problems.push(`missing ${PAGE}`);
    return problems;
  }
  if (!/data-testid=["']posting-template-default-class["']/.test(page)) {
    problems.push(`${PAGE}: must use data-testid=posting-template-default-class`);
  }
  const blk = stripComments(block(page, "posting-template-default-class"));
  if (!/createKind=["']class["']/.test(blk)) {
    problems.push(`${PAGE}: default class must use createKind=class`);
  }
  if (!/ReferenceSelect/.test(blk)) {
    problems.push(`${PAGE}: default class must use ReferenceSelect`);
  }
  if (/SelectCombobox/.test(blk)) {
    problems.push(`${PAGE}: default class must not use bare SelectCombobox`);
  }
  if (!/default_class_id/.test(page)) {
    problems.push(`${PAGE}: must still persist default_class_id`);
  }
  // Debit/credit account parity anchors stay createKind=account
  if (!/createKind=["']account["']/.test(page)) {
    problems.push(`${PAGE}: debit/credit must keep createKind=account`);
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
  const original = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  const planted = original.replace(/createKind=["']class["']/g, 'createKind="item"');
  fs.writeFileSync(path.join(ROOT, PAGE), planted);
  try {
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
      cwd: ROOT,
      encoding: "utf8",
    });
    if (r.status === 0) {
      throw new Error("selftest expected FAIL when createKind=class removed");
    }
    console.log(`${LABEL}: selftest PASS (planted createKind mismatch fails)`);
  } finally {
    fs.writeFileSync(path.join(ROOT, PAGE), original);
  }
}

if (process.argv.includes("--selftest")) selftest();
else main();
