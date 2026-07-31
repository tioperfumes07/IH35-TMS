#!/usr/bin/env node
/**
 * LST-PICKER-01 slice — DriverDetail Profile Class (TMS catalog) was a bare SelectCombobox
 * over catalogs.classes with no first-row +Create. Wire ReferenceSelect createKind=class
 * (parity with ItemEditor / NewServiceDrawerForm / ManualJE).
 *
 * Cursor even claim: 1882.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-lst-picker01-driver-class-inline-create";
const PAGE = "apps/frontend/src/pages/DriverDetail.tsx";

function readRel(root, rel, overrides) {
  if (overrides && Object.prototype.hasOwnProperty.call(overrides, rel)) return overrides[rel];
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
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
  if (!/data-testid=["']driver-qbo-class-select["']/.test(page)) {
    problems.push(`${PAGE}: must use data-testid=driver-qbo-class-select`);
  }
  const blk = block(page, "driver-qbo-class-select");
  if (!/createKind=["']class["']/.test(blk)) {
    problems.push(`${PAGE}: Class (TMS catalog) must use createKind=class`);
  }
  if (!/ReferenceSelect/.test(blk)) {
    problems.push(`${PAGE}: Class picker must use ReferenceSelect`);
  }
  // Ban bare SelectCombobox inside the class testid block
  if (/SelectCombobox/.test(blk)) {
    problems.push(`${PAGE}: Class picker must not use bare SelectCombobox`);
  }
  if (!/qbo_class_id/.test(page)) {
    problems.push(`${PAGE}: must still persist qbo_class_id`);
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
