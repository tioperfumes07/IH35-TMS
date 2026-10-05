#!/usr/bin/env node
/**
 * GUARD: the bank-match candidate universe is ALL transactions and documents — and must never
 * silently narrow.
 *
 * THIS GUARD REPLACES verify-match-candidates-are-settlement-born-only.mjs, WHICH ENCODED A RULING
 * THE OWNER HAS SUPERSEDED.
 *
 * The retired guard enforced ROUND 155.24: "fetchLedgerCandidates must NOT select from expenses /
 * AR payments". It failed on main for weeks and was never wired, so nobody had to resolve it. When
 * I raised it rather than exempting or 'fixing' it, the owner answered directly, 2026-09-30:
 *
 *   "I expect to see AR and regular expenses and bills and regular receive payments and deposits
 *    that we create to appear in suggested matches etc, or if I filter by 7-Eleven have all
 *    expenses for that vendor etc. The engine is for ALL transactions-documents."
 *   "Or suggested match to a payment we recorded by a customer that did not factor etc."
 *
 * So the code was RIGHT and the guard was STALE. That distinction matters: I did not delete a
 * guard to make a build green — the property it asserted is no longer the owner's rule, and the
 * OPPOSITE property is. A settlement-born-only matcher would hide every non-factored customer
 * payment and every ordinary vendor expense from the suggestions, which is precisely the work he
 * does by hand.
 *
 * THE LIVE RULE: fetchLedgerCandidates must cover every document kind the owner reconciles
 * against. Narrowing it is the defect now.
 *
 * Measured live 2026-09-30, USMCA: expenses 1,640 · bills 96 · AR payments 7 · bill_payments wired.
 * banking.transfers exists with 0 rows — not asserted, because a guard must not demand a source
 * that has never been written to; when transfers start being created they join the list here.
 *
 * Usage:  node scripts/verify-match-candidates-cover-all-documents.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-match-candidates-cover-all-documents";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SERVICE = "apps/backend/src/accounting/bank-recon/match.service.ts";

/** Every document kind the owner reconciles a bank transaction against. */
export const REQUIRED_SOURCES = [
  [/FROM accounting\.expenses\b/i, "accounting.expenses", "ordinary vendor expenses — 'if I filter by 7-Eleven have all expenses for that vendor'"],
  [/FROM accounting\.bills\b/i, "accounting.bills", "vendor bills"],
  [/FROM accounting\.bill_payments\b/i, "accounting.bill_payments", "payments made against bills"],
  [/FROM accounting\.payments\b/i, "accounting.payments", "AR receive-payments — 'a payment we recorded by a customer that did not factor'"],
];

export function assertCandidatesCoverAllDocuments(src) {
  const problems = [];

  const start = src.indexOf("async function fetchLedgerCandidates");
  if (start < 0) {
    problems.push(`${SERVICE}: fetchLedgerCandidates is gone — this guard cannot verify the candidate universe.`);
    return problems;
  }
  const after = src.slice(start);
  const stop = after.indexOf("\nasync function loadLedgerAmountCents");
  const body = stop > 0 ? after.slice(0, stop) : after.slice(0, 8000);

  for (const [re, name, why] of REQUIRED_SOURCES) {
    if (!re.test(body)) {
      problems.push(
        `${SERVICE}: fetchLedgerCandidates no longer selects from ${name}. The owner reconciles against it — ${why}. ` +
          `Narrowing the candidate universe hides real documents from his suggested matches.`
      );
    }
  }

  // The retired rule must not come back by the side door.
  if (/settlement-born-candidates\.js/.test(body) && /SQL_BILL_IS_SETTLEMENT_BORN[\s\S]{0,400}FROM accounting\.expenses/.test(body) === false && /must NOT select/.test(src)) {
    // informational only — no assertion
  }

  // Company scoping is not optional on a money read.
  if (!/operating_company_id/.test(body)) {
    problems.push(`${SERVICE}: fetchLedgerCandidates no longer scopes by operating_company_id. A money read is never unscoped.`);
  }

  return problems;
}

/** BANK-F3688 — amount loader fail-closed: missing/voided/revoked must not become $0. */
export function assertLedgerAmountFailClosed(src) {
  const problems = [];
  const start = src.indexOf("async function loadLedgerAmountCents");
  if (start < 0) {
    problems.push(`${SERVICE}: loadLedgerAmountCents is gone — accept would have no live-document amount gate`);
    return problems;
  }
  const next = src.indexOf("\nasync function ", start + 10);
  const body = next > 0 ? src.slice(start, next) : src.slice(start);
  if (!/requireLedgerAmountRow/.test(src) && !/ledger_document_not_found/.test(body)) {
    problems.push(`${SERVICE}: loadLedgerAmountCents must refuse a missing/voided document (ledger_document_not_found)`);
  }
  if (!/function requireLedgerAmountRow/.test(src)) {
    problems.push(`${SERVICE}: requireLedgerAmountRow must be the one fail-closed amount reader`);
  }
  if (!/SELECT amount_cents::int FROM accounting\.payments[\s\S]{0,160}voided_at IS NULL/.test(src)) {
    problems.push(`${SERVICE}: payment amount load must exclude voided_at (candidates already do)`);
  }
  if (!/FROM accounting\.bill_payments[\s\S]{0,280}revoked_at IS NULL/.test(src)) {
    problems.push(`${SERVICE}: bill_payment amount load must exclude revoked_at`);
  }
  if (!/FROM banking\.transfers[\s\S]{0,220}revoked_at IS NULL/.test(src)) {
    problems.push(`${SERVICE}: transfer amount load must exclude revoked_at`);
  }
  if (!/FROM accounting\.journal_entries je[\s\S]{0,400}je\.voided_at IS NULL/.test(src)) {
    problems.push(`${SERVICE}: JE amount load must exclude voided_at`);
  }
  if (!/FROM accounting\.deposits[\s\S]{0,280}posting_status = 'posted'/.test(src)) {
    problems.push(`${SERVICE}: deposit amount load must require posting_status=posted`);
  }
  return problems;
}

const read = () => fs.readFileSync(path.join(ROOT, SERVICE), "utf8");

if (process.argv.includes("--selftest")) {
  const failures = [];
  const good = read();
  const expect = (name, src, needle) => {
    const problems = assertCandidatesCoverAllDocuments(src);
    if (!problems.some((p) => p.includes(needle))) failures.push(`${name}: planted defect NOT caught (got: ${problems.join(" | ") || "none"})`);
  };

  const live = assertCandidatesCoverAllDocuments(good);
  if (live.length) failures.push(`live: ${live.join(" | ")}`);

  // 1..4 — THE RETIRED RULE, applied one source at a time. Each of these is exactly what the old
  // settlement-born-only guard would have demanded, and each one hides real work from the owner.
  expect("expenses-removed", good.replace(/FROM accounting\.expenses\b/i, "FROM accounting.nothing_e"), "accounting.expenses");
  expect("bills-removed", good.replace(/FROM accounting\.bills\b/i, "FROM accounting.nothing_b"), "accounting.bills");
  expect("bill-payments-removed", good.replace(/FROM accounting\.bill_payments\b/i, "FROM accounting.nothing_bp"), "accounting.bill_payments");
  expect("ar-payments-removed", good.replace(/FROM accounting\.payments\b/i, "FROM accounting.nothing_p"), "accounting.payments");
  // 5 — company scoping dropped.
  expect("unscoped", good.replace(/operating_company_id/g, "xx_col"), "never unscoped");
  // 6 — the function itself removed.
  expect("function-gone", good.replace("async function fetchLedgerCandidates", "async function removedCandidates"), "fetchLedgerCandidates is gone");

  const amountLive = assertLedgerAmountFailClosed(good);
  if (amountLive.length) failures.push(`amount-live: ${amountLive.join(" | ")}`);
  const amountExpect = (name, planted, needle) => {
    const problems = assertLedgerAmountFailClosed(planted);
    if (!problems.some((p) => p.includes(needle))) {
      failures.push(`amount-${name}: planted defect NOT caught (got: ${problems.join(" | ") || "none"})`);
    }
  };
  amountExpect(
    "helper-gone",
    good.replace("function requireLedgerAmountRow", "function requireLedgerAmountMaybe"),
    "requireLedgerAmountRow"
  );
  amountExpect(
    "payment-voided-dropped",
    good.replace(
      "SELECT amount_cents::int FROM accounting.payments\n        WHERE id = $1::uuid AND operating_company_id = $2::uuid AND voided_at IS NULL",
      "SELECT amount_cents::int FROM accounting.payments\n        WHERE id = $1::uuid AND operating_company_id = $2::uuid"
    ),
    "voided_at"
  );

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED (${failures.length})`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exitCode = 1;
  } else {
    console.log(`${LABEL} selftest 8/8 OK`);
  }
} else {
  const problems = [...assertCandidatesCoverAllDocuments(read()), ...assertLedgerAmountFailClosed(read())];
  if (problems.length) {
    console.error(`${LABEL} FAILED (${problems.length})`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} PASS — candidate universe covers expenses, bills, bill_payments and AR payments; amount loader fail-closed`);
}
