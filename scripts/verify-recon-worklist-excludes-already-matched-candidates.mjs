#!/usr/bin/env node
/**
 * RECON-ACCEPT-DEAD-CANDIDATE — the Bank Reconciliation worklist must never offer a bank
 * transaction as a live "Accept" candidate once it is already resolved (review_state='matched'
 * via a direct Categorize posting its own JE). acceptMatchWithResolveDifference's own idempotency
 * guard (apps/backend/src/accounting/bank-recon/match.service.ts:
 * `if (txn.review_state === "matched") throw new Error("bank_transaction_already_matched")`)
 * permanently rejects Accept for such a row, so surfacing it as actionable is a dead end.
 *
 * Live-reproduced 2026-08-22: categorized a real USMCA bank_transaction (Wire Transfer Fee,
 * $15.00, id 438fb0c5) -> a real, balanced JE posted (1f8ef271, Dr 6300 Bank Service Charges &
 * Wire Fees / Cr 1000 Bank of America - Operating (USMCA)) -> the reconciliation worklist
 * correctly showed it as an auto-match candidate ("Auto-match candidate: je") -> clicking Accept
 * 500'd every time (direct fetch to /api/v1/bank-recon/accept-match confirmed
 * {"statusCode":500,"error":"Internal Server Error","message":"bank_transaction_already_matched"})
 * -> a fresh reload still showed the row as an unresolved candidate, Progress stuck.
 */
import fs from "node:fs";

const LABEL = "verify-recon-worklist-excludes-already-matched-candidates";
const F = {
  worklist: "apps/backend/src/accounting/bank-recon/recon-worklist.service.ts",
  match: "apps/backend/src/accounting/bank-recon/match.service.ts",
};
const checks = [
  [
    "worklist",
    /FROM banking\.reconciliation_matches rm\s*\n\s*JOIN banking\.bank_transactions bt ON bt\.id = rm\.bank_transaction_id[\s\S]{0,300}AND rm\.match_state = 'auto_matched'[\s\S]{0,1600}AND bt\.review_state <> 'matched'/,
    "auto_matched_candidates query excludes bank transactions already cleared by a direct Categorize (review_state='matched')",
  ],
  [
    "match",
    /if \(txn\.review_state === "matched"\)[\s\S]{0,80}throw new Error\("bank_transaction_already_matched"\)/,
    "acceptMatchWithResolveDifference still rejects an already-matched bank line (idempotency guard this fix routes around, not removes)",
  ],
];
const live = Object.fromEntries(Object.entries(F).map(([k, file]) => [k, fs.readFileSync(file, "utf8")]));
const audit = (src) => checks.filter(([k, re]) => !re.test(src[k])).map(([, , msg]) => msg);
const failures = audit(live);
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
if (process.argv.includes("--selftest")) {
  for (const [k, re, msg] of checks) {
    const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
    const planted = live[k].replace(new RegExp(re.source, flags), "/* planted RECON-ACCEPT-DEAD-CANDIDATE defect */");
    if (planted === live[k] || !audit({ ...live, [k]: planted }).includes(msg)) {
      console.error(`${LABEL} SELFTEST FAIL — plant escaped: ${msg}`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${checks.length}/${checks.length} regressions rejected`);
  process.exit(0);
}
console.log(`${LABEL} PASS — worklist never offers a dead-end Accept candidate for an already-resolved bank line`);
