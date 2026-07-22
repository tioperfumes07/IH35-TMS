#!/usr/bin/env node
/**
 * verify-chain-06-factoring-ar-tieout.mjs
 *
 * CHAIN-06 — read-only tie-out proof: invoice -> A/R -> factoring (secured-borrowing, CODER-34) must
 * reconcile to the penny, and AR must relieve ONLY when the customer pays the factor — never at funding.
 * See docs/specs/qbo-parity/CHAIN-06-FACTORING-AR-TIEOUT-PROOF.md for the full design.
 *
 * STATUS 2026-07-21 — CODE FIXED + GUARDS WIRED (verify-steps 920–922); live money path still
 * requires owner flag/ops proof. The historical §5 claim that "amount_paid_cents is never updated by
 * the factoring poster" is STALE: CONN-2 closed that code gap via applyCustomerPaymentSubledgerRelief /
 * applyChargebackSubledgerRelief (static regression: verify-chain-06-ar-subledger-fix.mjs / step 921).
 * This script remains the Leg B/C (and informational) live-DB tie-out; it does NOT claim LIVE-VERIFIED
 * money until FACTORING_GL_POSTING_ENABLED is owner-gated ON with ops proof. Evidence: PR #3121.
 *
 * GROUNDED (live code, verified against apps/backend/src/accounting/factoring-posting/poster.service.ts,
 * PR #1770 / CODER-34, merged 2026-07-05, flag FACTORING_GL_POSTING_ENABLED default OFF):
 *   FUNDING            memo 'Factoring funding <display_id>'            — CR factoring_advance_liability, A/R UNTOUCHED.
 *   CUSTOMER PAYMENT   memo 'Factoring customer payment <display_id> (...)' — DR factoring_advance_liability / CR ar_control.
 *   CHARGEBACK repay   memo 'Factoring chargeback repay <display_id> (...)' — DR factoring_advance_liability (+interest) / CR cash.
 *   CHARGEBACK return  memo 'Factoring chargeback receivable <display_id> (...)' — DR factoring_recoursed_ar / CR ar_control.
 *   Roles resolved via accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active).
 *
 * ASSERTIONS:
 *   B — no JE with memo LIKE 'Factoring funding %' has any posting line on the entity's ar_control account.
 *       This is the literal "A/R is UNTOUCHED at funding" invariant CODER-34 was built to guarantee.
 *   C — per factoring_advance, once its status is terminal (collected/released/recourse_returned/voided),
 *       the liability credited at funding must equal the liability debited by customer-payment + chargeback
 *       events (the borrowing round-trips to zero — no residual liability left unexplained).
 *
 * Informational-only (never fails the guard, reported so it's not silently missed):
 *   subledgerGap — factored invoices whose GL says A/R was relieved (a customer-payment or chargeback-return
 *     JE exists referencing the invoice's factoring_advance_id) but accounting.invoices.amount_paid_cents
 *     still lags. After the CONN-2 code fix this should be empty for NEW posts; any remaining rows are
 *     live/legacy data (or flag-OFF environments with no posts) — investigate, do not treat as "code
 *     still open." Companion static guard (step 921) proves the poster wiring cannot regress silently.
 *
 * MODE: ADVISORY by default. CHAIN_06_TIEOUT_ENFORCE=true -> blocking (exit 1) on B/C only.
 * DEGRADE-SAFE: no DATABASE_URL -> skip with a warning and exit 0 — never crash CI.
 * Read-only. Never repairs a row.
 * Wired via scripts/verify-steps/922-verify-chain-06-factoring-ar-tieout.mjs (Rule 17).
 */

import process from "node:process";

const ENFORCE = process.env.CHAIN_06_TIEOUT_ENFORCE === "true";

/** Single-source assertion SQL. */
export const ASSERTIONS = {
  legB_fundingTouchesAr: `
    SELECT je.id AS journal_entry_id, je.operating_company_id, je.memo, jep.account_id, jep.amount_cents
      FROM accounting.journal_entries je
      JOIN accounting.journal_entry_postings jep ON jep.journal_entry_uuid = je.id
      JOIN accounting.chart_of_accounts_roles r
        ON r.operating_company_id = je.operating_company_id
       AND r.role = 'ar_control' AND r.is_active AND r.account_id = jep.account_id
     WHERE je.memo LIKE 'Factoring funding %'`,
  legC_liabilityRoundTrip: `
    SELECT fa.id AS factoring_advance_id, fa.operating_company_id, fa.display_id, fa.status,
           COALESCE(funding.credited, 0)  AS liability_credited_at_funding,
           COALESCE(customer.debited, 0) + COALESCE(chargeback.debited, 0) AS liability_debited_after
      FROM accounting.factoring_advances fa
      LEFT JOIN LATERAL (
        SELECT SUM(jep.amount_cents)::bigint AS credited
          FROM accounting.journal_entries je
          JOIN accounting.journal_entry_postings jep ON jep.journal_entry_uuid = je.id
         WHERE je.operating_company_id = fa.operating_company_id
           AND je.memo = 'Factoring funding ' || fa.display_id
           AND jep.debit_or_credit = 'credit'
      ) funding ON true
      LEFT JOIN LATERAL (
        SELECT SUM(jep.amount_cents)::bigint AS debited
          FROM accounting.journal_entries je
          JOIN accounting.journal_entry_postings jep ON jep.journal_entry_uuid = je.id
         WHERE je.operating_company_id = fa.operating_company_id
           AND je.memo LIKE 'Factoring customer payment ' || fa.display_id || ' (%'
           AND jep.debit_or_credit = 'debit'
      ) customer ON true
      LEFT JOIN LATERAL (
        SELECT SUM(jep.amount_cents)::bigint AS debited
          FROM accounting.journal_entries je
          JOIN accounting.journal_entry_postings jep ON jep.journal_entry_uuid = je.id
         WHERE je.operating_company_id = fa.operating_company_id
           AND je.memo LIKE 'Factoring chargeback repay ' || fa.display_id || ' (%'
           AND jep.debit_or_credit = 'debit'
      ) chargeback ON true
     WHERE fa.status IN ('collected', 'released', 'recourse_returned', 'voided')
       AND COALESCE(funding.credited, 0) <> (COALESCE(customer.debited, 0) + COALESCE(chargeback.debited, 0))`,
};

/** Informational only — never fails the guard. See docs/specs/qbo-parity/CHAIN-06-FACTORING-AR-TIEOUT-PROOF.md §5. */
export const INFORMATIONAL = {
  subledgerGap: `
    SELECT DISTINCT i.id AS invoice_id, i.operating_company_id, i.display_id, i.total_cents, i.amount_paid_cents, i.status
      FROM accounting.invoices i
      JOIN accounting.factoring_advances fa ON fa.id = i.factoring_advance_id
      JOIN accounting.journal_entries je
        ON je.operating_company_id = i.operating_company_id
       AND (je.memo LIKE 'Factoring customer payment ' || fa.display_id || ' (%'
         OR je.memo LIKE 'Factoring chargeback receivable ' || fa.display_id || ' (%')
     WHERE i.amount_paid_cents < i.total_cents`,
};

async function main() {
  const cs = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
  if (!cs) {
    console.warn("[chain-06-tieout] no DATABASE_URL — skipping (advisory). Run against a local/CI/Neon-branch DB for the real proof.");
    process.exit(0);
  }

  const pg = (await import("pg")).default;
  const pool = new pg.Pool({ connectionString: cs, max: 2 });

  try {
    const violations = {};
    for (const [name, sql] of Object.entries(ASSERTIONS)) {
      const r = await pool.query(sql);
      if (r.rows.length) violations[name] = r.rows;
    }

    const info = {};
    for (const [name, sql] of Object.entries(INFORMATIONAL)) {
      const r = await pool.query(sql);
      if (r.rows.length) info[name] = r.rows;
    }

    if (Object.keys(info).length) {
      console.log("\n[chain-06-tieout] INFORMATIONAL (not a failure — see CHAIN-06-STATUS-2026-07-21.md; code gap closed, investigate live/legacy rows):");
      for (const [name, rows] of Object.entries(info)) {
        console.log(`  [${name}] ${rows.length} row(s) — amount_paid_cents lags GL relief (legacy/live data or flag-OFF; poster wiring is guarded by step 921).`);
      }
    }

    const total = Object.values(violations).reduce((n, rows) => n + rows.length, 0);
    if (total === 0) {
      console.log("[chain-06-tieout] PASS — funding never touches A/R; factoring liability round-trips to zero on terminal advances.");
      process.exit(0);
    }

    const header = ENFORCE ? "CHAIN-06 TIE-OUT GUARD FAILED" : "CHAIN-06 TIE-OUT — ADVISORY (not blocking)";
    console.error(`\n${header}`);
    console.error("=".repeat(64));
    for (const [name, rows] of Object.entries(violations)) {
      console.error(`  [${name}] ${rows.length} violation(s):`);
      for (const row of rows.slice(0, 25)) console.error(`     ${JSON.stringify(row)}`);
      if (rows.length > 25) console.error(`     … +${rows.length - 25} more`);
    }
    console.error("=".repeat(64));
    console.error("Drift is fixed by a human via a new, reviewed JE — this guard DETECTS only.");

    process.exit(ENFORCE ? 1 : 0);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error("[chain-06-tieout] error:", e?.message ?? e);
  process.exit(ENFORCE ? 1 : 0);
});
