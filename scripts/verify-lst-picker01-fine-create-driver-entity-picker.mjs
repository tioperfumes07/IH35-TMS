#!/usr/bin/env node
/**
 * LST-PICKER-01 — FineCreateModal Driver used Combobox allowAddNew → side-channel CreateDriverModal.
 * Wire EntityPicker kind=driver (VERIFY-2 first-row create → mdata.drivers).
 *
 * Cursor even claim: 1896.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-lst-picker01-fine-create-driver-entity-picker";
const PAGE = "apps/frontend/src/pages/safety/components/FineCreateModal.tsx";

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
  // Tight window — avoid swallowing the next picker comment (allowAddNew prose).
  const m = src.match(new RegExp(`data-testid=["']${testid}["'][\\s\\S]{0,900}?</div>`));
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
  if (!/data-testid=["']fine-create-driver-picker["']/.test(page)) {
    problems.push(`${PAGE}: must use data-testid=fine-create-driver-picker`);
  }
  const blk = stripComments(block(page, "fine-create-driver-picker"));
  if (!/EntityPicker/.test(blk)) problems.push(`${PAGE}: driver must use EntityPicker`);
  if (!/kind=["']driver["']/.test(blk)) problems.push(`${PAGE}: driver must use kind=driver`);
  const pageStripped = stripComments(page);
  if (/CreateDriverModal/.test(pageStripped)) {
    problems.push(`${PAGE}: must not keep side-channel CreateDriverModal (EntityPicker owns create)`);
  }
  if (/allowAddNew/.test(blk)) {
    problems.push(`${PAGE}: driver block must not use Combobox allowAddNew side-channel`);
  }
  if (!/subjectDriverId/.test(page)) {
    problems.push(`${PAGE}: must still persist subjectDriverId`);
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
  const planted = original.replace(/kind=["']driver["']/g, 'kind="unit"');
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
