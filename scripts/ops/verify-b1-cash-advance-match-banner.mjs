#!/usr/bin/env node
/**
 * BANK-F91026 — B-1 §5 online banking match banner on cash advance detail when linked_bank_txn_id set.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const LABEL = "verify-b1-cash-advance-match-banner";
const DRAWER = "apps/frontend/src/pages/cash-advances/components/AdvanceDetailDrawer.tsx";

function main() {
  const src = fs.readFileSync(path.join(ROOT, DRAWER), "utf8");
  if (!src.includes("OnlineBankingMatchBanner")) {
    throw new Error(`${DRAWER}: must import OnlineBankingMatchBanner (B-1 §5)`);
  }
  if (!src.includes('data-testid="b1-online-banking-match-banner"') && !src.includes("bankTransactionId={String(advance.linked_bank_txn_id)}")) {
    throw new Error(`${DRAWER}: must wire OnlineBankingMatchBanner to linked_bank_txn_id`);
  }
  if (!/advance\.linked_bank_txn_id/.test(src)) {
    throw new Error(`${DRAWER}: banner must gate on linked_bank_txn_id`);
  }
  console.log(`${LABEL}: PASS`);
}

function selftest() {
  try {
    main();
    console.log(`${LABEL} --selftest PASS`);
  } catch (e) {
    console.error(`${LABEL} --selftest FAIL`, e);
    process.exit(1);
  }
}

if (process.argv.includes("--selftest") || !process.argv.includes("--check-only")) {
  selftest();
}
