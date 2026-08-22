#!/usr/bin/env node
/**
 * ACCT-F5765 — Posting Lineage's own "Source type" free-text input carried the placeholder
 * "invoice | bill | payment" as its ONLY guidance. journal_entry_postings.source_transaction_type is
 * matched with a strict equality WHERE clause (accounting/audit-trail/service.ts's
 * listAccountingSourceLineage) — there is no "payment"/"customer_payment" aliasing on the read side, so
 * a user following the placeholder's own example (typing "payment") got a real, silent 0-row result for
 * a transaction that DOES have posting lineage — live-proven: PMT-2026-00007
 * (c85cc5dd-1499-407a-8e18-ad5cfe5fb86c) has 2 real posting rows, both correctly
 * source_transaction_type='customer_payment'. The identical trap existed in AccountingAuditTrailPage.tsx
 * too (same placeholder, same strict-equality backend).
 *
 * INVARIANT (static — no database): both PostingLineagePage.tsx AND AccountingAuditTrailPage.tsx's
 * Source type inputs must NOT carry the misleading bare-"payment" placeholder, and must wire a
 * <datalist> (via the shared lib/accounting-source-transaction-types.ts list, so the two pages cannot
 * drift apart the way the original bug's two representations did) that includes "customer_payment" —
 * the real stored value.
 *
 * Self-test: node scripts/verify-posting-lineage-page-source-type-datalist.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE_TARGETS = [
  "apps/frontend/src/pages/accounting/PostingLineagePage.tsx",
  "apps/frontend/src/pages/accounting/AccountingAuditTrailPage.tsx",
];
const SHARED_LIST = "apps/frontend/src/lib/accounting-source-transaction-types.ts";
const LABEL = "verify-posting-lineage-page-source-type-datalist";

export function checkPageSource(src) {
  const problems = [];

  if (/placeholder="invoice \| bill \| payment"/.test(src)) {
    problems.push("stale misleading placeholder ('invoice | bill | payment') still present — 'payment' is not a real source_transaction_type");
  }
  const datalistIdMatch = src.match(/<datalist id=["']([^"']+)["']/);
  if (!datalistIdMatch) {
    problems.push("no <datalist id=...> wired for the Source type input");
  } else if (!new RegExp(`list=["']${datalistIdMatch[1]}["']`).test(src)) {
    problems.push("Source type <input> is not wired to the datalist via list=");
  }
  if (!/KNOWN_ACCOUNTING_SOURCE_TRANSACTION_TYPES/.test(src)) {
    problems.push("does not reference the shared KNOWN_ACCOUNTING_SOURCE_TRANSACTION_TYPES list — either an inline copy (which can drift) or the datalist was dropped");
  }

  return problems;
}

export function checkSharedListSource(src) {
  const problems = [];
  if (!/["']customer_payment["']/.test(src)) {
    problems.push("shared list no longer includes 'customer_payment' (the real stored value that motivated this fix)");
  }
  return problems;
}

function selftest() {
  const goodPage = `
    import { KNOWN_ACCOUNTING_SOURCE_TRANSACTION_TYPES } from "../../lib/accounting-source-transaction-types";
    <input
      placeholder="e.g. customer_payment, bill, invoice"
      list="posting-lineage-source-types"
    />
    <datalist id="posting-lineage-source-types">
      {KNOWN_ACCOUNTING_SOURCE_TRANSACTION_TYPES.map((t) => <option key={t} value={t} />)}
    </datalist>
  `;
  const goodPageProblems = checkPageSource(goodPage);
  if (goodPageProblems.length) {
    console.error(`${LABEL} SELFTEST FAIL — known-good page fixture flagged: ${goodPageProblems.join("; ")}`);
    process.exit(1);
  }

  const pageMutations = [
    goodPage.replace('placeholder="e.g. customer_payment, bill, invoice"', 'placeholder="invoice | bill | payment"'),
    goodPage.replace(/<datalist[\s\S]*?<\/datalist>/, ""),
    goodPage.replace('list="posting-lineage-source-types"', ""),
    goodPage.replace(/KNOWN_ACCOUNTING_SOURCE_TRANSACTION_TYPES/g, "SOME_OTHER_LIST"),
  ];
  for (const [i, mutated] of pageMutations.entries()) {
    if (checkPageSource(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — page regression mutation ${i} escaped detection`);
      process.exit(1);
    }
  }

  const goodList = `export const KNOWN_ACCOUNTING_SOURCE_TRANSACTION_TYPES = ["bill", "customer_payment", "invoice"] as const;`;
  if (checkSharedListSource(goodList).length) {
    console.error(`${LABEL} SELFTEST FAIL — known-good shared-list fixture flagged`);
    process.exit(1);
  }
  const listMutation = goodList.replace('"customer_payment", ', "");
  if (checkSharedListSource(listMutation).length === 0) {
    console.error(`${LABEL} SELFTEST FAIL — shared-list regression mutation escaped detection`);
    process.exit(1);
  }

  console.log(`${LABEL} SELFTEST PASS — ${pageMutations.length + 1} regression mutations all detected`);
  process.exit(0);
}

if (process.argv.includes("--selftest")) selftest();

const allFailures = [];

const sharedListPath = path.join(ROOT, SHARED_LIST);
if (!fs.existsSync(sharedListPath)) {
  allFailures.push(`${SHARED_LIST}: file not found`);
} else {
  const failures = checkSharedListSource(fs.readFileSync(sharedListPath, "utf8"));
  for (const f of failures) allFailures.push(`${SHARED_LIST}: ${f}`);
}

for (const target of PAGE_TARGETS) {
  const targetPath = path.join(ROOT, target);
  if (!fs.existsSync(targetPath)) {
    allFailures.push(`${target}: file not found`);
    continue;
  }
  const failures = checkPageSource(fs.readFileSync(targetPath, "utf8"));
  for (const f of failures) allFailures.push(`${target}: ${f}`);
}

if (allFailures.length) {
  console.error(`[${LABEL}] FAILED:\n${allFailures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — both PostingLineagePage.tsx and AccountingAuditTrailPage.tsx carry an honest placeholder + a shared datalist including the real 'customer_payment' value`);
