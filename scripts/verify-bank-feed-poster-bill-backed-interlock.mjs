#!/usr/bin/env node
/**
 * ACCT-F5672 — the CHAIN-05 bank-feed poster must refuse BILL-BACKED categorizations with an honest
 * reason, before the no_account check.
 *
 * bulkPostTransactionsAsBills and the insurance dispersal/policy paths stamp category='bill' +
 * linked_entity_id=<accounting.bills.id> and never set matched_bill_id, so the pre-existing
 * Interlock 2 missed them. Such a line's GL belongs to CHAIN-03 (bill JE) + CHAIN-04 (bill payment);
 * the categorize poster posting it too would double-book the expense. Measured live before the
 * interlock: 24 USMCA insurance-dispersal placeholders — every linked bill VOID — fell through to
 * "no_account", which invites the exactly-wrong fix (stamp an account, mint expense JEs for voided
 * bills).
 *
 * Locked here (apps/backend/src/banking/bank-feed-gl-posting.service.ts):
 *   1. "bill_backed" is a declared skip reason;
 *   2. the decide() interlock checks BOTH category === "bill" AND linked_bill_id;
 *   3. it fires BEFORE the no_account check (order is the defense — after it, no_account wins and
 *      the misleading reason returns);
 *   4. the accounting.bills join resolving linked_entity_id is ENTITY-SCOPED
 *      (lb.operating_company_id = bt.operating_company_id).
 *
 * Run:  node scripts/verify-bank-feed-poster-bill-backed-interlock.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-bank-feed-poster-bill-backed-interlock";
const FILE = "apps/backend/src/banking/bank-feed-gl-posting.service.ts";

export function analyze(src) {
  const failures = [];
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "").replace(/^\s*--.*$/gm, "");

  if (!/\|\s*"bill_backed"/.test(code)) {
    failures.push(`${FILE}: "bill_backed" must be a declared BankFeedGlSkipReason (ACCT-F5672).`);
  }
  const interlockIdx = code.search(/txn\.category === "bill" \|\| txn\.linked_bill_id/);
  if (interlockIdx < 0) {
    failures.push(`${FILE}: the bill-backed interlock (category === "bill" || linked_bill_id) is missing — bill-backed lines fall through to the misleading no_account and invite a double-book "fix".`);
  }
  const noAccountIdx = code.search(/reason: "no_account"/);
  if (interlockIdx >= 0 && noAccountIdx >= 0 && interlockIdx > noAccountIdx) {
    failures.push(`${FILE}: the bill-backed interlock must run BEFORE the no_account check — after it, no_account wins and the honest reason never returns.`);
  }
  if (!/LEFT JOIN accounting\.bills lb\s+ON lb\.id = bt\.linked_entity_id\s+AND lb\.operating_company_id = bt\.operating_company_id/.test(code)) {
    failures.push(`${FILE}: the linked-bill join must exist and be entity-scoped (lb.operating_company_id = bt.operating_company_id) — an unscoped match resolves another entity's bill.`);
  }
  return failures;
}

export function run() {
  return analyze(fs.readFileSync(path.join(ROOT, FILE), "utf8"));
}

if (process.argv.includes("--selftest")) {
  const real = fs.readFileSync(path.join(ROOT, FILE), "utf8");
  const good = analyze(real);
  if (good.length) throw new Error(`[${LABEL}] selftest: the REAL file should PASS but failed: ${good.join("; ")}`);

  const m1 = real.replace(/txn\.category === "bill" \|\| txn\.linked_bill_id/, "false");
  if (!analyze(m1).some((f) => f.includes("interlock (category"))) {
    throw new Error(`[${LABEL}] selftest: removed interlock should FAIL but passed`);
  }

  const m2 = real.replace(/AND lb\.operating_company_id = bt\.operating_company_id/, "");
  if (!analyze(m2).some((f) => f.includes("entity-scoped"))) {
    throw new Error(`[${LABEL}] selftest: unscoped bill join should FAIL but passed`);
  }

  const m3 = real.replace(/\|\s*"bill_backed"/, "");
  if (!analyze(m3).some((f) => f.includes("declared BankFeedGlSkipReason"))) {
    throw new Error(`[${LABEL}] selftest: removed reason literal should FAIL but passed`);
  }

  console.log(`[${LABEL}] selftest: PASS — real green; removed-interlock, unscoped-join and removed-reason mutations all red`);
  process.exit(0);
}

const failures = run();
if (failures.length) {
  console.error(`[${LABEL}] FAILED — ${failures.length} check(s) regressed:`);
  for (const f of failures) console.error("  ✗", f);
  process.exit(1);
}
console.log(`[${LABEL}] PASS — bill-backed categorizations are refused honestly, before no_account, via an entity-scoped bill join`);
