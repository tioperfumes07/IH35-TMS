#!/usr/bin/env node
import fs from "node:fs";
const page = fs.readFileSync("apps/frontend/src/pages/accounting/ReceiptsPage.tsx", "utf8");
const matrix = () => JSON.parse(fs.readFileSync("docs/specs/scoreboard/modules/accounting.required.json", "utf8"));
const failures = (m = matrix()) => [
  ["receipt detail bank N/A", !m.leaves.find((leaf) => leaf.id === "accounting.panel.receipt_detail")?.required?.includes("bank")],
  ["receipt source union exact", page.includes('function receiptEntityKind(row: ReceiptItem): "expense" | "bill" | "payment"')],
  ["receipt drills its direct source", page.includes("kind={receiptEntityKind(data)}") && page.includes("id={data.entity_id}")],
].filter(([, ok]) => !ok).map(([name]) => name);
if (process.argv.includes("--selftest")) {
  const m = matrix(); m.leaves.find((leaf) => leaf.id === "accounting.panel.receipt_detail").required.push("bank");
  if (!failures(m).includes("receipt detail bank N/A")) process.exit(1);
  console.log("verify-bank-inline-surface-applicability selftest PASS — false bank requirement mutation red"); process.exit(0);
}
const missing = failures(); if (missing.length) { console.error(`verify-bank-inline-surface-applicability FAIL — ${missing.join(", ")}`); process.exit(1); }
console.log("verify-bank-inline-surface-applicability PASS — receipt drills its direct expense/bill/payment source; bank is a downstream payment relation");
