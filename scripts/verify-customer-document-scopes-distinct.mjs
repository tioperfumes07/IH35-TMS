#!/usr/bin/env node
/**
 * Codex QA 11-02 — Customer Profile must not show two panels both titled "Documents"
 * with conflicting empty states. Linked files (vault) vs Billing attachments (financial subset).
 */
import fs from "node:fs";

const LABEL = "verify-customer-document-scopes-distinct";
const OVERVIEW = "apps/frontend/src/components/customers/CustomerProfileOverview.tsx";
const DETAIL = "apps/frontend/src/pages/CustomerDetail.tsx";

const overview = fs.readFileSync(OVERVIEW, "utf8");
const detail = fs.readFileSync(DETAIL, "utf8");
const fails = [];

if (!/Linked files/.test(overview)) {
  fails.push(`${OVERVIEW}: profile vault panel must be titled Linked files (not Documents)`);
}
if (/title=\{`Documents \(/.test(overview) || /title="Documents"/.test(overview)) {
  fails.push(`${OVERVIEW}: must not title the vault panel Documents (conflicts with Billing attachments)`);
}
if (!/Billing attachments/.test(detail)) {
  fails.push(`${DETAIL}: financial subset panel must be titled Billing attachments`);
}
if (/No documents linked/.test(detail)) {
  fails.push(`${DETAIL}: empty state must not say No documents linked (false conflict with Linked files)`);
}
if (!/No billing attachments linked/.test(detail)) {
  fails.push(`${DETAIL}: billing empty state must say No billing attachments linked`);
}

if (process.argv.includes("--selftest")) {
  if (fails.length) {
    console.error(`${LABEL} --selftest FAIL live red:\n  ${fails.join("\n  ")}`);
    process.exit(1);
  }
  const plantO = overview.replace(/Linked files/g, "Documents");
  const plantD = detail
    .replace(/Billing attachments/g, "Documents")
    .replace(/No billing attachments linked/g, "No documents linked");
  const planted = [];
  if (/title=\{`Documents \(/.test(plantO) || /Documents \(/.test(plantO)) planted.push("overview Documents");
  if (/No documents linked/.test(plantD)) planted.push("detail conflict empty");
  if (!/Billing attachments/.test(plantD)) planted.push("detail Documents title");
  if (planted.length < 2) {
    console.error(`${LABEL} --selftest FAIL plant weak`, planted);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

if (fails.length) {
  console.error(`${LABEL}: FAIL\n  ${fails.join("\n  ")}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — Customer Linked files ≠ Billing attachments scopes`);
