#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cardPath = path.join(ROOT, "apps/frontend/src/pages/banking/components/PlaidItemCard.tsx");
const displayPath = path.join(ROOT, "apps/frontend/src/pages/banking/components/plaid-item-display.ts");

function fail(message) {
  console.error(`verify:plaid-status-derived-from-state FAIL: ${message}`);
  process.exit(1);
}

for (const target of [cardPath, displayPath]) {
  if (!fs.existsSync(target)) fail(`missing ${path.relative(ROOT, target)}`);
}

const card = fs.readFileSync(cardPath, "utf8");
const display = fs.readFileSync(displayPath, "utf8");

if (card.includes('"Healthy"') || card.includes("'Healthy'")) {
  fail("PlaidItemCard.tsx must not hardcode Healthy badge text");
}

if (!card.includes("derivePlaidConnectionBadgeLabel")) {
  fail("PlaidItemCard.tsx must derive badge label from plaid-item-display helpers");
}

if (!display.includes("derivePlaidConnectionBadgeLabel")) {
  fail("plaid-item-display.ts must export derivePlaidConnectionBadgeLabel");
}

if (!display.includes("latestPlaidLastSyncedAtMs")) {
  fail("plaid-item-display.ts must derive last sync from account timestamps");
}

console.log("verify:plaid-status-derived-from-state PASS");
