#!/usr/bin/env node
/**
 * LST-PICKER-01 — WorkOrderCreateModal Section A/B pickers were bare SelectCombobox
 * (expense CoA + service item) with no first-row +Create.
 *
 * Cursor even claim: 1894.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-lst-picker01-wo-create-category-item-inline-create";
const PAGE = "apps/frontend/src/pages/maintenance/WorkOrderCreateModal.tsx";

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
  const m = src.match(new RegExp(`data-testid=["']${testid}["'][\\s\\S]{0,2000}`));
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

  if (!/data-testid=["']wo-create-category-picker["']/.test(page)) {
    problems.push(`${PAGE}: must use data-testid=wo-create-category-picker`);
  }
  if (!/data-testid=["']wo-create-item-picker["']/.test(page)) {
    problems.push(`${PAGE}: must use data-testid=wo-create-item-picker`);
  }

  const cat = stripComments(block(page, "wo-create-category-picker"));
  if (!/ReferenceSelect/.test(cat)) problems.push(`${PAGE}: category picker must use ReferenceSelect`);
  if (!/createKind=["']account["']/.test(cat)) {
    problems.push(`${PAGE}: category (expense CoA) must use createKind=account`);
  }
  if (/SelectCombobox/.test(cat)) problems.push(`${PAGE}: category must not use bare SelectCombobox`);

  const item = stripComments(block(page, "wo-create-item-picker"));
  if (!/ReferenceSelect/.test(item)) problems.push(`${PAGE}: item picker must use ReferenceSelect`);
  if (!/createKind=["']item["']/.test(item)) {
    problems.push(`${PAGE}: service item must use createKind=item`);
  }
  if (/SelectCombobox/.test(item)) problems.push(`${PAGE}: item must not use bare SelectCombobox`);

  if (!/category_id/.test(page) || !/item_id/.test(page)) {
    problems.push(`${PAGE}: must still persist category_id and item_id`);
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
  const planted = original
    .replace(/createKind=["']account["']/g, 'createKind="vendor"')
    .replace(/createKind=["']item["']/g, 'createKind="vendor"');
  fs.writeFileSync(fp, planted);
  try {
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
      cwd: ROOT,
      encoding: "utf8",
    });
    if (r.status === 0) throw new Error("selftest expected FAIL");
    console.log(`${LABEL}: selftest PASS`);
  } finally {
    fs.writeFileSync(fp, original);
  }
}

if (process.argv.includes("--selftest")) selftest();
else main();
