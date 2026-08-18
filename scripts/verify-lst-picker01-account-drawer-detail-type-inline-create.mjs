#!/usr/bin/env node
/**
 * LST-PICKER-01 / CATALOG-ACCOUNTING-CREATE-PICKER-LAW-OVERCLAIM — AccountDrawer's Detail Type
 * field was a raw <select> beside a "+ Create detail type" link that navigated AWAY to
 * /lists/accounting/detail-types, losing the in-progress account form (QB-STD-3/4 violation).
 * This is the genuine picker_law gap that ACCT-F-catalog-picker-law-overclose deliberately did
 * NOT sweep into the honesty-drop batches (chart_of_accounts.create / detail_types*.create stay
 * Required — this is the real fix). Mirrors the sibling parent-account-picker guard
 * (verify-lst-picker01-account-drawer-parent-inline-create.mjs) for the SAME file's OTHER field.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-lst-picker01-account-drawer-detail-type-inline-create";
const PAGE = "apps/frontend/src/pages/lists/accounting/AccountDrawer.tsx";
const REGISTRY = "apps/frontend/src/components/parity/catalogPickerRegistry.ts";

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
  const page = readRel(root, PAGE, overrides);
  const registry = readRel(root, REGISTRY, overrides);
  if (!page) return [`missing ${PAGE}`];
  if (!/data-testid=["']detail-type-picker["']/.test(page)) {
    problems.push(`${PAGE}: must keep data-testid=detail-type-picker`);
  }
  const blk = stripComments(block(page, "detail-type-picker"));
  if (!/ReferenceSelect/.test(blk)) problems.push(`${PAGE}: detail type must use ReferenceSelect`);
  if (!/createKind=["']detail_type["']/.test(blk)) problems.push(`${PAGE}: detail type must use createKind=detail_type`);
  if (!/createExtras=\{\{\s*account_type_id:/.test(blk)) {
    problems.push(`${PAGE}: detail type creator must scope createExtras to account_type_id`);
  }
  if (/<select[\s>]/.test(blk)) problems.push(`${PAGE}: detail type must not use a raw <select>`);
  // The old navigate-away "+ Create detail type" link must be gone — QB-STD-3/4 (create in place,
  // never lose the in-progress account form).
  if (/\+ Create detail type/.test(page)) {
    problems.push(`${PAGE}: must not navigate away via the old "+ Create detail type" link`);
  }
  if (!/detail_type_id/.test(page)) problems.push(`${PAGE}: must still persist detail_type_id`);
  if (!registry) return [...problems, `missing ${REGISTRY}`];
  if (!/detail_type:\s*\{/.test(registry)) problems.push(`${REGISTRY}: must register a detail_type picker entry`);
  if (!/account_type_id\?:\s*string/.test(registry)) {
    problems.push(`${REGISTRY}: CatalogCreateValues must carry account_type_id for the cascaded create`);
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
  const planted = original.replace(/createKind=["']detail_type["']/g, 'createKind="vendor"');
  fs.writeFileSync(fp, planted);
  try {
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { cwd: ROOT, encoding: "utf8" });
    if (r.status === 0) throw new Error("selftest expected FAIL (createKind mutation)");
  } finally {
    fs.writeFileSync(fp, original);
  }

  const original2 = fs.readFileSync(fp, "utf8");
  const planted2 = original2.replace(/createExtras=\{\{\s*account_type_id:[^}]*\}\}/, "");
  fs.writeFileSync(fp, planted2);
  try {
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { cwd: ROOT, encoding: "utf8" });
    if (r.status === 0) throw new Error("selftest expected FAIL (createExtras mutation)");
  } finally {
    fs.writeFileSync(fp, original2);
  }

  console.log(`${LABEL}: selftest PASS`);
}

if (process.argv.includes("--selftest")) selftest();
else main();
