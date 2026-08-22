#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const appPath = path.join(process.cwd(), "apps/frontend/src/App.tsx");
const routesManifestPath = path.join(process.cwd(), "apps/frontend/src/routes/manifest.tsx");
const pagePath = path.join(process.cwd(), "apps/frontend/src/pages/accounting/PostingLineagePage.tsx");
// orphan-triage F1: the legacy AccountingSubNav.tsx (a dead, zero-consumer left-rail-era nav
// component — see subnav-manifest.ts's header comment + verify-accounting-nav.mjs Check 4, which
// forbids any OTHER page from importing it) was deleted. The live, unified accounting sub-nav is
// AccountingSubNavWrapper.tsx, sourced from subnav-manifest.ts's ACCOUNTING_MORE_TABS/CLEAN_TABS —
// check that file instead of resurrecting the retired one.
const navPath = path.join(process.cwd(), "apps/frontend/src/pages/accounting/subnav-manifest.ts");
const apiPath = path.join(process.cwd(), "apps/frontend/src/api/accounting.ts");

function fail(message) {
  console.error(`verify:posting-lineage-ui-contract — FAILED\n- ${message}`);
  process.exit(1);
}

for (const file of [appPath, pagePath, navPath, apiPath]) {
  if (!fs.existsSync(file)) fail(`missing required file: ${file}`);
}

const appText = `${fs.readFileSync(appPath, "utf8")}\n${fs.existsSync(routesManifestPath) ? fs.readFileSync(routesManifestPath, "utf8") : ""}`;
const pageText = fs.readFileSync(pagePath, "utf8");
const navText = fs.readFileSync(navPath, "utf8");
const apiText = fs.readFileSync(apiPath, "utf8");

if (!appText.includes('path="/accounting/posting-lineage"')) {
  fail("App routing must expose /accounting/posting-lineage");
}
if (!navText.includes('/accounting/posting-lineage')) {
  fail("Accounting sub-nav manifest must include Posting lineage destination");
}
if (!pageText.includes("getAccountingSourceLineage")) {
  fail("Posting lineage page must call getAccountingSourceLineage");
}
if (!pageText.includes('=== "payment"') || !pageText.includes('"customer_payment"')) {
  fail("Posting lineage page must map UI payment to canonical customer_payment");
}
if (!pageText.includes("source_transaction_type") || !pageText.includes("source_transaction_id")) {
  fail("Posting lineage page must submit source_transaction_type and source_transaction_id");
}
if (!apiText.includes("export function getAccountingSourceLineage")) {
  fail("accounting API client must expose getAccountingSourceLineage");
}
if (/entityLabel\(\s*null\s*,\s*row\.journal_entry_id/.test(pageText)) {
  fail("PostingLineagePage JE column must use memo, not entityLabel(null, journal_entry_id)");
}
if (/entityLabel\(\s*null\s*,\s*row\.linked_object_id/.test(pageText)) {
  fail("PostingLineagePage linked object must use linked_object_display_id, not UUID tombstone");
}
if (!pageText.includes("visibleDocumentLabel(")) {
  fail("Posting lineage source and reverse-object links must render human document labels");
}
if (/entityLabel\(rows\[0\]\?\.source_transaction_display_id/.test(pageText)) {
  fail("Posting lineage source must not regress to a not-visible tombstone for a mounted record");
}
if (/entityLabel\(row\.linked_object_display_id/.test(pageText)) {
  fail("Posting lineage reverse object must not regress to a not-visible tombstone for a mounted record");
}

console.log("verify:posting-lineage-ui-contract — OK");
