#!/usr/bin/env node
/**
 * verify-acct-account-picker-createkind — root-cause lock for the "+ Add new account" picker class.
 *
 * ROOT CAUSE (recurring): a ReferenceSelect that selects/creates a real catalogs.accounts GL
 * account (bank/cash Asset, card liability, target COA) labels its inline create row
 * "+ Add new account" but is wired createKind="category". createKind="category" opens the
 * QuickCreateEntityModal (category quick-create) instead of the rich account InlineCreateDrawer
 * (NewAccountDrawerForm, createKind="account"). The operator can therefore only create a mis-typed
 * expense CATEGORY where a bank/cash/liability ACCOUNT is required — and because the picker is
 * account-type-filtered, that created row never even appears in the list. Same defect class as the
 * Receive Payment deposit picker (accounting PR 7/M) and CoA Roles / Expense Category Map (27/28).
 *
 * FIX: any ReferenceSelect whose add-new label is "+ Add new account" MUST use createKind="account".
 *
 * This guard scans the WHOLE frontend (not a hardcoded file list) so the regression cannot return
 * on any new money surface. Chrome-only — no posting, schema, or Neon seed.
 *
 * Usage:
 *   node scripts/verify-acct-account-picker-createkind.mjs            # scan the repo
 *   node scripts/verify-acct-account-picker-createkind.mjs --selftest # planted-failure proof
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-acct-account-picker-createkind";
const SCAN_DIR = path.join(ROOT, "apps/frontend/src");
const ADD_NEW_ACCOUNT = 'addNewLabel="+ Add new account"';

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*$/gm, "");
}

/**
 * Return an array of human-readable violation strings for one file's source.
 * A violation = an "+ Add new account" label whose surrounding ReferenceSelect props
 * carry createKind="category" (and not createKind="account").
 */
export function findViolations(rel, src) {
  const violations = [];
  let idx = src.indexOf(ADD_NEW_ACCOUNT);
  while (idx >= 0) {
    // The createKind prop sits on the same JSX element — a few lines above or below the label.
    const window = stripComments(src.slice(Math.max(0, idx - 500), idx + 160));
    const hasCategory = window.includes('createKind="category"');
    const hasAccount = window.includes('createKind="account"');
    if (hasCategory && !hasAccount) {
      const line = src.slice(0, idx).split("\n").length;
      violations.push(`${rel}:${line} — "+ Add new account" picker uses createKind="category" (must be createKind="account")`);
    }
    idx = src.indexOf(ADD_NEW_ACCOUNT, idx + ADD_NEW_ACCOUNT.length);
  }
  return violations;
}

function walk(dir, acc) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      walk(full, acc);
    } else if (entry.name.endsWith(".tsx") && !entry.name.endsWith(".test.tsx")) {
      acc.push(full);
    }
  }
  return acc;
}

function selftest() {
  // Planted failure: the exact anti-pattern MUST be flagged.
  const bad = `<ReferenceSelect options={o} createKind="category" addNewLabel="+ Add new account" />`;
  const badHit = findViolations("planted.tsx", bad);
  if (badHit.length !== 1) {
    console.error("FAIL(selftest): detector did not flag the planted createKind=category account picker");
    process.exit(1);
  }
  // Planted pass: the correct pattern MUST NOT be flagged.
  const good = `<ReferenceSelect options={o} createKind="account" addNewLabel="+ Add new account" />`;
  if (findViolations("ok.tsx", good).length !== 0) {
    console.error("FAIL(selftest): detector false-flagged a correct createKind=account picker");
    process.exit(1);
  }
  // A legitimate category picker (no "+ Add new account" label) MUST NOT be flagged.
  const category = `<ReferenceSelect options={o} createKind="category" placeholder="Select category account" />`;
  if (findViolations("cat.tsx", category).length !== 0) {
    console.error("FAIL(selftest): detector false-flagged a legitimate category picker");
    process.exit(1);
  }
  console.log(`PASS(selftest): ${LABEL}`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const files = walk(SCAN_DIR, []);
  const violations = [];
  for (const full of files) {
    const rel = path.relative(ROOT, full);
    violations.push(...findViolations(rel, fs.readFileSync(full, "utf8")));
  }
  if (violations.length > 0) {
    console.error(`FAIL: ${LABEL} — ${violations.length} account picker(s) mis-wired createKind="category":`);
    for (const v of violations) console.error(`  - ${v}`);
    process.exit(1);
  }
  console.log(`PASS: ${LABEL} — every "+ Add new account" picker uses createKind="account"`);
}

main();
