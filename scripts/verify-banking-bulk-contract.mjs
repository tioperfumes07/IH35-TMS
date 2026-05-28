#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const routePath = path.join(root, "apps/backend/src/banking/categorization.routes.ts");
const source = fs.readFileSync(routePath, "utf8");

const requiredSnippets = [
  'app.post("/api/v1/banking/transactions/bulk-categorize"',
  'app.post("/api/v1/banking/transactions/bulk-post-as-bills"',
  "bulkCategorizeSpecBodySchema",
  "bulkPostAsBillsBodySchema",
  "bulkCategorizeTransactions(client, {",
  "bulkPostTransactionsAsBills(",
  "bulk_txn_cross_tenant_or_missing",
];

for (const snippet of requiredSnippets) {
  if (!source.includes(snippet)) {
    throw new Error(`verify:banking-bulk-contract failed: missing snippet -> ${snippet}`);
  }
}

console.log("verify:banking-bulk-contract — OK");
