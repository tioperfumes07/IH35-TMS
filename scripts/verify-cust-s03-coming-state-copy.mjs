#!/usr/bin/env node
/**
 * CUST-S03 — Customer detail tabs that used to be Coming-soon shells are now
 * fill-not-shell real engines (loads / open invoices / notes+tasks). Guard pins
 * the wired contract; do not restore COMING_STATE_COPY placeholders.
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

function assert(src) {
  const problems = [];
  // Placeholders retired — projects/opportunities/conversations are wired engines.
  if (/const COMING_STATE_COPY/.test(src)) {
    problems.push(`${FILE}: COMING_STATE_COPY must stay retired (projects/opportunities/conversations are wired)`);
  }
  if (/function CustomerTabComingState/.test(src)) {
    problems.push(`${FILE}: CustomerTabComingState must stay retired`);
  }
  if (!/testId="customer-tab-projects"/.test(src) || !/storageKey="customer-projects-loads"/.test(src)) {
    problems.push(`${FILE}: projects tab must render BoardSection + loads ParityTable (fill-not-shell)`);
  }
  if (!/testId="customer-tab-opportunities"/.test(src) || !/storageKey="customer-opportunities-open-invoices"/.test(src)) {
    problems.push(`${FILE}: opportunities tab must render open-invoices ParityTable (fill-not-shell)`);
  }
  if (!/data-testid="customer-tab-conversations"/.test(src) || !/<CustomerNotesTab/.test(src) || !/<TasksTab/.test(src)) {
    problems.push(`${FILE}: conversations tab must compose Notes + Tasks (fill-not-shell)`);
  }
  if (!/activeTab === "statements" \? \(\s*<CounterpartyStatementView kind="customer" counterpartyId=\{selectedCustomer\.id\}/.test(src)) {
    problems.push(`${FILE}: statements must render the real customer statement of account`);
  }
  if (!/activeTab === "recurring_transactions"[\s\S]*customer-recurring-templates/.test(src)) {
    problems.push(`${FILE}: recurring transactions must render real templates`);
  }
  if (!/activeTab === "late_fees"[\s\S]*customer-late-fees-overdue/.test(src)) {
    problems.push(`${FILE}: late fees must render real overdue invoices`);
  }
  if (!/activeTab === "activity_feed" \? \(\s*<CustomerFinancialActivityTab\b/.test(src)) {
    problems.push(`${FILE}: activity feed must render its real reader`);
  }
  if (!/activeTab === "notes"[\s\S]*<CustomerNotesTab/.test(src)) {
    problems.push(`${FILE}: notes must render profile notes`);
  }
  if (!/activeTab === "tasks"[\s\S]*<TasksTab/.test(src)) {
    problems.push(`${FILE}: tasks must render the canonical task surface`);
  }
  return problems;
}

const src = readFileSync(path.join(ROOT, FILE), "utf8");

if (SELFTEST) {
  const plants = [
    ["projects board stripped", src.replace(/testId="customer-tab-projects"/, 'testId="customer-tab-projects-stripped"')],
    ["opportunities board stripped", src.replace(/testId="customer-tab-opportunities"/, 'testId="customer-tab-opportunities-stripped"')],
    ["conversations compose stripped", src.replace(/data-testid="customer-tab-conversations"/, 'data-testid="customer-tab-conversations-stripped"')],
    ["coming-state copy restored", src + '\nconst COMING_STATE_COPY = { projects: "x" };\n'],
  ];
  for (const [name, mutant] of plants) {
    if (assert(mutant).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — escaped: ${name}`);
      process.exit(1);
    }
  }
  const clean = assert(src);
  if (clean.length) {
    console.error(`${LABEL} SELFTEST FAIL — clean source flagged: ${clean.join("; ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — ${plants.length} plants rejected`);
  process.exit(0);
}

const problems = assert(src);
if (problems.length) {
  console.error(`${LABEL} FAIL`);
  for (const p of problems) console.error(`- ${p}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — projects/opportunities/conversations fill-not-shell wired`);
