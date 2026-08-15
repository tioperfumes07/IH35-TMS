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
const NEW_FORM = "apps/frontend/src/components/parity/drawers/NewAccountDrawerForm.tsx";
const DRAWER = "apps/frontend/src/pages/lists/accounting/AccountDrawer.tsx";

function readRel(root, rel, overrides) {
  if (overrides && Object.prototype.hasOwnProperty.call(overrides, rel)) return overrides[rel];
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

function newFormEmbedsAccountDrawer(newFormSrc) {
  return (
    /<AccountDrawer[\s>]/.test(newFormSrc) &&
    (/from ["'].*AccountDrawer["']|from ["'].*\/AccountDrawer["']/.test(newFormSrc) ||
      /import\s*\{\s*AccountDrawer\s*\}/.test(newFormSrc))
  );
}

/** Parent picker lives in AccountDrawer when NewAccountDrawerForm is a thin embed wrapper. */
function parentPickerSource(root = ROOT, overrides = null) {
  const newForm = readRel(root, NEW_FORM, overrides);
  if (!newForm) return { rel: NEW_FORM, src: null };
  if (newFormEmbedsAccountDrawer(newForm)) {
    return { rel: DRAWER, src: readRel(root, DRAWER, overrides) };
  }
  return { rel: NEW_FORM, src: newForm };
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
  const { rel, src: form } = parentPickerSource(root, overrides);
  if (!form) return [`missing ${rel}`];

  const newForm = readRel(root, NEW_FORM, overrides);
  if (newForm && newFormEmbedsAccountDrawer(newForm) && /const DETAIL_TYPES\s*[:=]/.test(newForm)) {
    problems.push(`${NEW_FORM}: must not hardcode DETAIL_TYPES when embedding AccountDrawer`);
  }

  const testId = rel === DRAWER ? "parent-account-picker" : "new-account-parent-select";
  if (!new RegExp(`data-testid=["']${testId}["']`).test(form)) {
    problems.push(`${rel}: must use data-testid=${testId}`);
  }
  const blk = stripComments(block(form, testId));
  if (!/ReferenceSelect/.test(blk)) problems.push(`${rel}: parent picker must use ReferenceSelect`);
  if (!/createKind=["']account["']/.test(blk)) problems.push(`${rel}: parent must use createKind=account`);
  if (/<select[\s>]/.test(blk)) problems.push(`${rel}: parent must not use bare <select>`);
  if (!/parent_account_id|parentAccount/.test(form)) problems.push(`${rel}: must still persist parent account`);
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
  const fp = path.join(ROOT, DRAWER);
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
