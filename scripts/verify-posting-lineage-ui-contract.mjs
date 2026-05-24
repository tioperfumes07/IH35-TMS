#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const appPath = path.join(process.cwd(), "apps/frontend/src/App.tsx");
const routesManifestPath = path.join(process.cwd(), "apps/frontend/src/routes/manifest.tsx");
const pagePath = path.join(process.cwd(), "apps/frontend/src/pages/accounting/PostingLineagePage.tsx");
const navPath = path.join(process.cwd(), "apps/frontend/src/pages/accounting/AccountingSubNav.tsx");
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
  fail("Accounting sub-nav must include Posting lineage destination");
}
if (!pageText.includes("getAccountingSourceLineage")) {
  fail("Posting lineage page must call getAccountingSourceLineage");
}
if (!pageText.includes("source_transaction_type") || !pageText.includes("source_transaction_id")) {
  fail("Posting lineage page must submit source_transaction_type and source_transaction_id");
}
if (!apiText.includes("export function getAccountingSourceLineage")) {
  fail("accounting API client must expose getAccountingSourceLineage");
}

console.log("verify:posting-lineage-ui-contract — OK");
