#!/usr/bin/env node
/**
 * LST-F3350 — CoA Account Type picker must expose QBO finer types (~15: Bank, A/R, …)
 * from the live account-type catalog — not only the 8 GAAP enums.
 *
 * Surfaces: AccountDrawer, NewAccountDrawerForm, QuickCreateEntityModal (category).
 *
 * Run: node scripts/verify-coa-account-type-qbo-finer-picker.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-coa-account-type-qbo-finer-picker";

const FILES = {
  api: "apps/frontend/src/api/coa-list.ts",
  drawer: "apps/frontend/src/pages/lists/accounting/AccountDrawer.tsx",
  newForm: "apps/frontend/src/components/parity/drawers/NewAccountDrawerForm.tsx",
  quick: "apps/frontend/src/components/forms/shared/QuickCreateEntityModal.tsx",
};

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function problems(srcs) {
  const out = [];
  const { api, drawer, newForm, quick } = srcs;

  if (!/export function accountTypePickerGroupsFromCatalog/.test(api)) {
    out.push("coa-list must export accountTypePickerGroupsFromCatalog");
  }
  if (!/export function detailTypesForAccountTypeSelection/.test(api)) {
    out.push("coa-list must export detailTypesForAccountTypeSelection");
  }
  if (!/export function resolveAccountTypeCatalogEntry/.test(api)) {
    out.push("coa-list must export resolveAccountTypeCatalogEntry");
  }
  if (!/export function catalogCodeToCoaEnum/.test(api)) {
    out.push("coa-list must export catalogCodeToCoaEnum (parent filter maps Bank→Asset)");
  }

  for (const [name, src] of [
    ["AccountDrawer", drawer],
    ["NewAccountDrawerForm", newForm],
    ["QuickCreateEntityModal", quick],
  ]) {
    if (!/accountTypePickerGroupsFromCatalog/.test(src)) {
      out.push(`${name} must call accountTypePickerGroupsFromCatalog`);
    }
    if (!/data-testid="account-type-qbo-finer-select"/.test(src)) {
      out.push(`${name} must expose data-testid=account-type-qbo-finer-select`);
    }
  }

  if (!/detailTypesForAccountTypeSelection/.test(drawer)) {
    out.push("AccountDrawer must cascade detail types via detailTypesForAccountTypeSelection");
  }
  if (!/previewEntry\?\.code\s*\?\?\s*form\.account_type/.test(drawer)) {
    out.push("AccountDrawer save must prefer previewEntry.code (catalog code)");
  }
  if (!/previewEntry\?\.code\s*\?\?\s*form\.accountType/.test(newForm)) {
    out.push("NewAccountDrawerForm save must prefer previewEntry.code");
  }
  if (!/resolveAccountTypeCatalogEntry/.test(quick)) {
    out.push("QuickCreateEntityModal category create must resolve catalog code");
  }

  return out;
}

function audit() {
  const srcs = Object.fromEntries(Object.entries(FILES).map(([k, rel]) => [k, read(rel)]));
  const errs = problems(srcs);
  if (errs.length) {
    console.error(`${LABEL} FAIL`);
    for (const e of errs) console.error(`- ${e}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — QBO finer Account Type picker on drawer + new-form + quick-create`);
}

if (process.argv.includes("--selftest")) {
  const srcs = Object.fromEntries(Object.entries(FILES).map(([k, rel]) => [k, read(rel)]));
  const ok = problems(srcs);
  if (ok.length) {
    console.error(`${LABEL} selftest baseline red: ${ok.join("; ")}`);
    process.exit(1);
  }
  const broken = {
    ...srcs,
    drawer: srcs.drawer
      .replace(/accountTypePickerGroupsFromCatalog/g, "ACCOUNT_TYPE_GROUPS_ONLY")
      .replace(/data-testid="account-type-qbo-finer-select"/g, 'data-testid="legacy-8-enum"'),
  };
  const bad = problems(broken);
  if (bad.length < 2) {
    console.error(`${LABEL} selftest: mutation must fail (≥2); got ${JSON.stringify(bad)}`);
    process.exit(1);
  }
  console.log(`${LABEL} selftest OK`);
  process.exit(0);
}

audit();
