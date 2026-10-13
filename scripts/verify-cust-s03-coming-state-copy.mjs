#!/usr/bin/env node
/**
 * CUST-S03 — remaining follow-up Customer tabs must render honest COMING_STATE_COPY
 * (named data-source gap), never a silent empty table.
 *
 *   node scripts/verify-cust-s03-coming-state-copy.mjs
 *   node scripts/verify-cust-s03-coming-state-copy.mjs --selftest
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SELFTEST = process.argv.includes("--selftest");
const LABEL = "verify-cust-s03-coming-state-copy";
const FILE = "apps/frontend/src/pages/Customers.tsx";

const REQUIRED = [
  "projects",
  "opportunities",
  "conversations",
];
const NOW_WIRED = ["activity_feed", "statements", "recurring_transactions", "late_fees", "notes", "tasks"];

function assert(src) {
  const problems = [];
  if (!/const COMING_STATE_COPY/.test(src)) {
    problems.push(`${FILE}: missing COMING_STATE_COPY map`);
  }
  if (!/function CustomerTabComingState/.test(src)) {
    problems.push(`${FILE}: missing CustomerTabComingState renderer`);
  }
  for (const key of REQUIRED) {
    if (!new RegExp(`${key}\\s*:`).test(src)) {
      problems.push(`${FILE}: COMING_STATE_COPY missing key ${key}`);
    }
  }
  for (const key of NOW_WIRED) {
    if (new RegExp(`${key}\\s*:`).test(src.match(/const COMING_STATE_COPY[\s\S]*?^};/m)?.[0] ?? "")) {
      problems.push(`${FILE}: wired tab ${key} must not remain in COMING_STATE_COPY`);
    }
  }
  // LEAD 443.99 class B (2026-10-12) — statements + activity anchors.
  //   old rule: statements render the two customer-statements-invoices / -payments tables; activity_feed renders
  //             <CustomerActivityFeed (audit events).
  //   new rule: statements render <CounterpartyStatementView kind="customer" counterpartyId={selectedCustomer.id}
  //             (the real statement of account, same read model as Vendors); activity_feed renders
  //             <CustomerFinancialActivityTab (invoices + payments + credits + advances).
  //   why: LST-F01 (#20806, 5326c4f496) replaced the two-table placeholder with the real statement and the audit
  //        feed with financial activity; the old anchors no longer exist. Each branch is now pinned to its own
  //        render (immediately after the ternary), tighter than the old [\s\S]* spans.
  if (!/activeTab === "statements" \? \(\s*<CounterpartyStatementView kind="customer" counterpartyId=\{selectedCustomer\.id\}/.test(src)) problems.push(`${FILE}: statements must render the real customer statement of account`);
  if (!/activeTab === "recurring_transactions"[\s\S]*customer-recurring-templates/.test(src)) problems.push(`${FILE}: recurring transactions must render real templates`);
  if (!/activeTab === "late_fees"[\s\S]*customer-late-fees-overdue/.test(src)) problems.push(`${FILE}: late fees must render real overdue invoices`);
  if (!/activeTab === "activity_feed" \? \(\s*<CustomerFinancialActivityTab\b/.test(src)) problems.push(`${FILE}: activity feed must render its real reader`);
  if (!/activeTab === "notes"[\s\S]*<CustomerNotesTab/.test(src)) problems.push(`${FILE}: notes must render profile notes`);
  if (!/activeTab === "tasks"[\s\S]*<TasksTab/.test(src)) problems.push(`${FILE}: tasks must render the canonical task surface`);
  // Each copy must name the missing source / follow-up — not silent empty.
  const block = src.match(/const COMING_STATE_COPY[\s\S]*?^};/m);
  if (block) {
    for (const key of REQUIRED) {
      const m = block[0].match(new RegExp(`${key}:\\s*"([^"]+)"`));
      if (!m || m[1].trim().length < 24) {
        problems.push(`${FILE}: ${key} copy too short / missing`);
      } else if (!/follow-up|needs a|flagged/i.test(m[1])) {
        problems.push(`${FILE}: ${key} copy must honestly name the gap (follow-up / needs a …)`);
      }
    }
  }
  if (!/CustomerTabComingState/.test(src) || !/COMING_STATE_COPY\[tab\]/.test(src)) {
    problems.push(`${FILE}: coming tabs must render COMING_STATE_COPY[tab]`);
  }
  return problems;
}

const src = readFileSync(path.join(ROOT, FILE), "utf8");

if (SELFTEST) {
  const plants = [
    ["empty coming-state copy", src.replace(/projects:\s*"[^"]+"/, 'projects: ""')],
    ["statements back to a placeholder", src.replace(/(activeTab === "statements" \? \(\s*)<CounterpartyStatementView/, "$1<CustomerTabComingState")],
    ["activity back to the audit feed", src.replace(/(activeTab === "activity_feed" \? \(\s*)<CustomerFinancialActivityTab/, "$1<CustomerActivityFeed")],
  ];
  const escaped = plants.filter(([, planted]) => planted === src || assert(planted).length === 0).map(([n]) => n);
  const clean = assert(src);
  if (escaped.length || clean.length) {
    console.error(`${LABEL} SELFTEST FAIL — escaped: ${escaped.join(", ") || "none"}; clean source flagged: ${clean.join("; ") || "none"}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — ${plants.length}/${plants.length} planted violations caught`);
  process.exit(0);
}

const problems = assert(src);
if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}
console.log(`${LABEL}: OK — 3 honest follow-up tabs remain; 6 implemented tabs are ratcheted to real surfaces`);
process.exit(0);
