#!/usr/bin/env node
/**
 * LOAD-TO-CASH CHAIN, LINK 4 PR 3 — QuickBooks' own precedence, owner-specified (2026-09-12):
 * "money-in excluded from auto-categorization; user rules first; suggestions second; manual review
 * third." This guard covers the FIRST clause only (the other two are a build-order fact about these
 * same engines, not something a static grep can assert).
 *
 * ROOT CAUSE this guard exists to prevent recurring: confirmed live (Explore agent, 2026-09-12)
 * that neither of the two pre-existing auto-categorization engines — accounting.banking_rules'
 * exact/fuzzy engine (banking-rules.engine.ts) nor banking.transaction_categories' Plaid-pattern
 * engine (plaid.service.ts's autoCategorize, invoked from categorization-rules.routes.ts and the
 * Plaid sync loop) — excluded is_credit=true (deposit/refund/customer-payment) rows from suggestion
 * or direct categorization. A customer payment landing via Plaid sync could silently receive a
 * guessed EXPENSE account and be auto-categorized (status='categorized') with zero human review.
 *
 * Each check below is a scoped source-text audit (not a live DB query) of the exact function/route
 * this PR fixed, so a future edit that quietly drops the exclusion fails loudly here instead of
 * silently reintroducing the same defect.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-money-in-excluded-from-auto-categorization";

function readFile(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

/** Extracts the source text between two marker substrings (inclusive of neither), or null if either
 * marker is missing — callers must treat null as "cannot verify" (fail), never as "skip". */
function scope(src, fromMarker, toMarker) {
  const start = src.indexOf(fromMarker);
  if (start === -1) return null;
  const end = src.indexOf(toMarker, start + fromMarker.length);
  if (end === -1) return null;
  return src.slice(start, end);
}

const CHECKS = [
  {
    label: "banking-rules.engine.ts: applyBankingRulesForTransaction excludes is_credit",
    file: "apps/backend/src/banking/banking-rules.engine.ts",
    fromMarker: "export async function applyBankingRulesForTransaction(",
    toMarker: "export async function ",
    needle: /is_credit\b[\s\S]{0,40}\breturn false/,
  },
  {
    label: "banking-rules.engine.ts: applyFuzzyVendorMatchForTransaction excludes is_credit",
    file: "apps/backend/src/banking/banking-rules.engine.ts",
    fromMarker: "export async function applyFuzzyVendorMatchForTransaction(",
    toMarker: "export async function applyBankingRulesForTransaction(",
    needle: /is_credit\b[\s\S]{0,40}\breturn null/,
  },
  {
    label: "banking-rules.engine.ts: applyBankingRulesForCompany's bulk candidate query excludes is_credit",
    file: "apps/backend/src/banking/banking-rules.engine.ts",
    fromMarker: "export async function applyBankingRulesForCompany(",
    toMarker: "for (const row of txnsRes.rows)",
    needle: /is_credit\s*=\s*false/,
  },
  {
    label: "plaid.service.ts: autoCategorize excludes is_credit",
    file: "apps/backend/src/integrations/plaid/plaid.service.ts",
    fromMarker: "export async function autoCategorize(",
    toMarker: "export async function syncTransactions(",
    needle: /is_credit\s*!==\s*false[\s\S]{0,40}\breturn null/,
  },
  {
    label: "categorization-rules.routes.ts: apply-historical candidate query excludes is_credit",
    file: "apps/backend/src/banking/categorization-rules.routes.ts",
    fromMarker: "/apply-historical",
    toMarker: "if (!dryRun) {",
    needle: /is_credit\s*=\s*false/,
  },
  {
    label: "p7-wave2.routes.ts: refresh-suggestion route excludes is_credit",
    file: "apps/backend/src/banking/p7-wave2.routes.ts",
    fromMarker: "/refresh-suggestion",
    toMarker: "// RECON-USMCA-BANK-01",
    needle: /is_credit\s*===\s*true[\s\S]{0,40}excludedMoneyIn\s*=\s*true/,
  },
];

export function auditAll(readFileFn = readFile) {
  const failures = [];
  for (const check of CHECKS) {
    const src = readFileFn(check.file);
    const window = scope(src, check.fromMarker, check.toMarker);
    if (window === null) {
      failures.push(`${check.file}: could not locate the function/route for "${check.label}" (markers moved — update this guard's markers, do not delete the check)`);
      continue;
    }
    if (!check.needle.test(window)) {
      failures.push(`${check.file}: ${check.label} — is_credit exclusion not found in scope`);
    }
  }
  return failures;
}

function run() {
  const failures = auditAll();
  if (failures.length > 0) {
    console.error(`${LABEL} FAIL:`);
    for (const f of failures) console.error("  ✗ " + f);
    process.exit(1);
  }
  console.log(`${LABEL} OK — ${CHECKS.length}/${CHECKS.length} known auto-categorization call sites exclude is_credit=true (money-in) transactions.`);
}

if (process.argv.includes("--selftest")) {
  const assert = await import("node:assert/strict").then((m) => m.default);
  assert.equal(auditAll().length, 0, "all 6 real call sites should already carry the is_credit exclusion");

  // MUTATION — strip the exclusion from one real file's real function and confirm this guard
  // catches it, using an in-memory override of readFile rather than touching the real file on disk.
  const real = readFile("apps/backend/src/banking/banking-rules.engine.ts");
  const mutated = real.replace(/if \(txn\.is_credit\) return false;\n\n  const rules = await client\.query/, "const rules = await client.query");
  assert.notEqual(mutated, real, "selftest setup bug: the exclusion text to strip was not found in the real file — update this mutation to match current source");
  const failures = auditAll((file) => (file === "apps/backend/src/banking/banking-rules.engine.ts" ? mutated : readFile(file)));
  assert.ok(
    failures.some((f) => f.includes("applyBankingRulesForTransaction")),
    "MUTATION (stripped is_credit guard from applyBankingRulesForTransaction) escaped detection"
  );

  console.log(`${LABEL} --selftest PASS (1/1 mutation caught)`);
  process.exit(0);
}

run();
