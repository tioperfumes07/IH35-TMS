#!/usr/bin/env node
/**
 * verify-item-editor-account-create-kind.mjs
 *
 * Rule-16/17 guard: ItemEditor "+ Add new account" must open account create chrome
 * (InlineCreateDrawer kind="account"), never QuickCreateEntityModal kind="category".
 *
 * Thin wrapper that reuses verify-item-editor-account-addnew checks so the wrong-kind
 * regression cannot ship even if someone weakens only one script.
 *
 * Usage:
 *   node scripts/verify-item-editor-account-create-kind.mjs
 *   node scripts/verify-item-editor-account-create-kind.mjs --selftest
 */
import path from "node:path";
import process from "node:process";
import { checksFor, run as runAddNew } from "./verify-item-editor-account-addnew.mjs";
import fs from "node:fs";

const TARGET = "apps/frontend/src/pages/lists/accounting/ItemEditorModal.tsx";

function stripComments(src) {
  return src
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

export function run() {
  const full = path.join(process.cwd(), TARGET);
  if (!fs.existsSync(full)) {
    console.error(`[verify-item-editor-account-create-kind] FAIL — missing ${TARGET}`);
    return { ok: false };
  }
  const src = stripComments(fs.readFileSync(full, "utf8"));
  const r = checksFor(src);
  if (!r.nestedAccountCreate || !r.noWrongCategoryKind) {
    console.error(
      "[verify-item-editor-account-create-kind] FAIL — wrong create kind wired for ItemEditor account pickers (see HOLD #3133)",
    );
    if (!r.nestedAccountCreate) console.error("  - expected InlineCreateDrawer kind=\"account\"");
    if (!r.noWrongCategoryKind) console.error("  - found QuickCreateEntityModal kind=\"category\" for account create");
    return { ok: false };
  }
  console.log("[verify-item-editor-account-create-kind] PASS — account create kind is account (not category)");
  return { ok: true };
}

function selftest() {
  const wrong = `
    function handleAccountCreated() {}
    <QuickCreateEntityModal open={accountCreateSide !== null} kind="category" onCreated={handleAccountCreated} />
  `;
  const right = `
    function handleAccountCreated() {}
    <InlineCreateDrawer open={accountCreateSide !== null} kind="account" onCreated={handleAccountCreated} />
  `;
  const w = checksFor(stripComments(wrong));
  const r = checksFor(stripComments(right));
  const failures = [];
  if (w.noWrongCategoryKind || w.nestedAccountCreate) failures.push("wrong fixture must fail kind checks");
  if (!r.nestedAccountCreate || !r.noWrongCategoryKind) failures.push("right fixture must pass kind checks");
  // Also prove addnew runner still green on real file when invoked from this entry.
  const live = runAddNew();
  if (!live.ok) failures.push("live addnew scan must PASS after create-kind fix");
  if (failures.length) {
    console.error("[verify-item-editor-account-create-kind] SELFTEST FAIL:");
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log("[verify-item-editor-account-create-kind] SELFTEST PASS");
}

const isMain = path.resolve(process.argv[1] ?? "") === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  if (process.argv.includes("--selftest")) selftest();
  else process.exit(run().ok ? 0 : 1);
}
