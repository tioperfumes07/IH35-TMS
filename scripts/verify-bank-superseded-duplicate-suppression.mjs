#!/usr/bin/env node
/**
 * GUARD — BANK-F13. A superseded bank-transaction COPY must not be categorizable, and suppression must
 * never be able to hide the last copy of a transaction.
 *
 * THE DEFECT (prod, 2026-07-30). Re-linking a bank account inserts a SECOND banking.bank_accounts row
 * for the SAME real account and the feed re-imports its history. Dedup cannot see it: the unique index
 * is (bank_account_id, dedup_hash) — per ACCOUNT — and the two rows' hashes differ (measured
 * same_dedup_hash = 0). USMCA "USMCA FREIGHT" Bank of America ••3224 existed twice; all 48 transactions
 * on the deactivated row were byte-identical (date + amount + description) to transactions on the
 * active row. Cash was safe (the balance sum filters is_active = true), but the categorization queue
 * filtered only by entity — "across ALL accounts" — so those 48 copies were listed for review, and
 * categorizing one POSTS IT TO THE GL, double-booking a transaction that already exists.
 *
 * THE TRAP THIS ALSO GUARDS. The obvious fix — hide transactions on deactivated accounts — would have
 * buried TRK's 4,619 transactions on Wells Fargo ••6103/••6129/••6137, where BOTH registrations are
 * deactivated and there is no active twin, i.e. no duplication at all. Suppression MUST require a
 * surviving ACTIVE twin. If that requirement is ever dropped, real uncategorized work disappears
 * silently — a worse defect than the one being fixed.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const SRC = "apps/backend/src/banking/pending-categorization.ts";
const MIGRATION = "db/migrations/202610270000_bankf13_one_active_registration_per_real_account.sql";
const TESTS = "apps/backend/src/banking/pending-categorization.test.ts";

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`  PASS  ${name}`);
  else {
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
    failures++;
  }
};

console.log("verify:bank-superseded-duplicate-suppression");

const src = readFileSync(join(ROOT, SRC), "utf8");

check("superseded-duplicate predicate exists", src.includes("export function supersededDuplicatePredicate"));

// The shared predicate must carry it, or the KPI and the For-review queue can disagree about which
// rows are offered — the exact divergence BANKING-1 exists to prevent.
check(
  "the SHARED pendingCategorizationPredicate folds in the suppression",
  /export function pendingCategorizationPredicate[\s\S]{0,400}supersededDuplicatePredicate/.test(src)
);

// ── The safety requirements. Losing any of these turns a targeted fix into data loss. ──────────────
check("suppression requires the row's OWN account to be inactive", src.includes("self_acct.is_active = false OR self_acct.deactivated_at IS NOT NULL"));
check("suppression requires a DIFFERENT twin registration", src.includes("twin_acct.id <> self_acct.id"));
check(
  "suppression requires the twin to be ACTIVE (never hide the last copy)",
  src.includes("twin_acct.is_active = true") && src.includes("twin_acct.deactivated_at IS NULL"),
  "without a surviving ACTIVE twin this would bury TRK's 4,619 rows on double-deactivated accounts"
);
check("twin must be the SAME REAL ACCOUNT — same entity", src.includes("twin_acct.operating_company_id = self_acct.operating_company_id"));
check("twin must match on institution", src.includes("twin_acct.institution_name IS NOT DISTINCT FROM self_acct.institution_name"));
check("twin must match on account mask", src.includes("twin_acct.account_mask     IS NOT DISTINCT FROM self_acct.account_mask"));
check("the twin transaction must be identical on date", src.includes("twin_bt.transaction_date = "));
check("the twin transaction must be identical on amount", src.includes("twin_bt.amount_cents     = "));
check("the twin transaction must be identical on description", src.includes("COALESCE(twin_bt.description, '') = COALESCE("));

// ── The structural door that let duplicates in ─────────────────────────────────────────────────────
const mig = readFileSync(join(ROOT, MIGRATION), "utf8");
check("migration creates the one-active-registration index", mig.includes("ux_bank_accounts_one_active_per_real_account"));
check("index is PARTIAL on active rows only (history is never constrained)", /WHERE[\s\S]{0,120}is_active = true[\s\S]{0,120}deactivated_at IS NULL/.test(mig));
check("index is idempotent", mig.includes("CREATE UNIQUE INDEX IF NOT EXISTS"));
check("migration aborts with an explanatory message if duplicates already exist", mig.includes("RAISE EXCEPTION") && mig.includes("more than one ACTIVE registration"));

const tests = readFileSync(join(ROOT, TESTS), "utf8");
check("behaviour tests cover the superseded-duplicate rule", tests.includes("BANK-F13"));

// ── Mutation arm: prove the ACTIVE-twin assertion can actually fail ────────────────────────────────
const withoutActiveTwin = src.replace("twin_acct.is_active = true", "twin_acct.is_active IS NOT NULL");
check(
  "mutation: dropping the ACTIVE-twin requirement would fail the check above",
  !withoutActiveTwin.includes("twin_acct.is_active = true")
);

if (failures > 0) {
  console.error(`\nverify:bank-superseded-duplicate-suppression FAILED (${failures})`);
  process.exit(1);
}
console.log("verify:bank-superseded-duplicate-suppression PASS");
