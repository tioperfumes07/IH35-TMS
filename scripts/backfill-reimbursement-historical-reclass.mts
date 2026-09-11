#!/usr/bin/env tsx
/**
 * ACCT-F26063 historical reclass — 76 misclassified USMCA driver reimbursements.
 *
 * PR #21730 (ACCT-F26063) fixed reimbursement GL categorization GOING FORWARD: fuel/toll/scale/parking/
 * other now route to their correct per-type GL account (via resolveReimbursementExpenseAccount) instead
 * of one generic "Driver Trip-Lumper Reimbursement" account. But ~76 already-posted USMCA reimbursements
 * (fuel=2, scale=1, other=73) still sit on the old generic account — explicitly NOT backfilled by that PR.
 *
 * This script is the HISTORICAL CORRECTION ONLY. It does not touch the going-forward code path.
 *
 * METHOD — audited reversal→recompute→repost, same treatment used elsewhere for closed-money corrections
 * (run-acct-f345-repost-advances-to-operating-bank-once.mts):
 *   1. For each reimbursement that posted to the generic account via a settlement close JE:
 *      - RECOMPUTE the correct per-type account using resolveReimbursementExpenseAccount() from
 *        coa-roles/resolver.service.ts (never hand-picked).
 *      - REVERSAL: create a reclass JE that CREDITS the generic account (reversing the old wrong debit).
 *      - REPOST: the same JE DEBITS the correct per-type account (reposting with the right account).
 *   2. One reclass JE per reimbursement — so audit.row_changes shows the reversal+repost pair for EACH.
 *   3. Idempotent: checks for an existing reclass JE by memo pattern before creating.
 *
 * LANE BOUNDARY: does not touch the going-forward code path (already shipped). Does not touch
 * banking/dispatch. Only creates reclass JEs through the real createJournalEntry service function —
 * never hand-posts raw SQL GL lines.
 *
 * SCOPE: USMCA only (5c854333-6ea5-4faa-af31-67cb272fef80). Only reimbursements from settlement close
 * JEs that are still posted (not reversed). Excludes: pending reimbursements (never posted), void
 * reimbursements (voided before settlement, never posted), and the 1 "other" reimbursement materialized
 * as extra_pay (posted to driver_pay_expense, not the generic account).
 *
 * Usage: npx tsx scripts/backfill-reimbursement-historical-reclass.mts [--apply]
 *        DATABASE_URL or DATABASE_DIRECT_URL required (non-pooler).
 */
import pg from "pg";
import { createJournalEntry } from "../apps/backend/src/accounting/journal-entries.service.ts";
import { resolveReimbursementExpenseAccount } from "../apps/backend/src/accounting/coa-roles/resolver.service.ts";
import { appendCrudAudit } from "../apps/backend/src/audit/crud-audit.ts";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ACTOR_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const GENERIC_ACCOUNT_ID = "b029d12d-f0b2-4f69-9e84-5df91a954c77"; // DRIVERTRIPLU056412 "Driver Trip-Lumper Reimbursement"
const RECLASS_MEMO_PREFIX = "ACCT-F26063 historical reclass — reimbursement";

const url = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_DIRECT_URL or DATABASE_URL required");
if (/-pooler\./.test(url)) {
  throw new Error(
    "REFUSING to run against the -pooler endpoint: session-scoped app.bypass_rls does not survive " +
      "transaction pooling, and under FORCE-RLS the precondition would read ZERO ROWS and pass."
  );
}

const APPLY = process.argv.includes("--apply");
const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
const client = await pool.connect();

try {
  await client.query(`SELECT set_config('app.bypass_rls','lucia',false)`);
  await client.query(`SELECT set_config('app.operating_company_id',$1,false)`, [USMCA]);

  // ── 1. Find all reimbursements that posted to the generic account via non-reversed close JEs ────
  // These are: non-voided OR voided-but-still-in-close-JE, settled, with a settlement_line_id,
  // materialized as 'reimbursement' (not 'extra_pay'), from a settlement close JE that is still
  // posted (reversed_by_je_id IS NULL).
  const reimbursementsRes = await client.query<{
    reimbursement_id: string;
    reimbursement_type: string;
    amount_cents: string;
    settlement_id: string;
    settlement_display_id: string;
    close_je_id: string;
    is_voided: boolean;
  }>(
    `SELECT r.id::text AS reimbursement_id,
            r.reimbursement_type,
            r.amount_cents::text,
            r.applied_to_settlement_id::text AS settlement_id,
            ds.display_id AS settlement_display_id,
            pgr.journal_entry_id::text AS close_je_id,
            (r.voided_at IS NOT NULL) AS is_voided
       FROM driver_finance.driver_reimbursements r
       JOIN driver_finance.driver_settlements ds ON ds.id = r.applied_to_settlement_id
       JOIN driver_finance.payrun_gl_runs pgr ON pgr.settlement_id = ds.id
       JOIN accounting.journal_entries je ON je.id = pgr.journal_entry_id
      WHERE r.operating_company_id = $1::uuid
        AND r.status = 'settled'
        AND je.status = 'posted'
        AND je.reversed_by_je_id IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM driver_finance.settlement_lines sl
           WHERE sl.source_reference_id = r.id
             AND sl.source_table = 'driver_finance.driver_reimbursements'
             AND sl.line_type = 'extra_pay'
             AND sl.voided_at IS NULL
        )
      ORDER BY ds.display_id, r.reimbursement_type, r.created_at`,
    [USMCA]
  );

  console.log(`[ACCT-F26063-reclass] found ${reimbursementsRes.rows.length} reimbursements on the generic account`);

  if (reimbursementsRes.rows.length === 0) {
    console.log("[ACCT-F26063-reclass] nothing to reclass — exiting");
    await client.release();
    await pool.end();
    process.exit(0);
  }

  // ── 2. For each reimbursement, resolve the correct account and create a reclass JE ────────────
  if (!APPLY) {
    console.log("DRY-RUN — would create reclass JEs for:");
    let totalCents = 0;
    for (const r of reimbursementsRes.rows) {
      const correctAccount = await resolveReimbursementExpenseAccount(client, USMCA, r.reimbursement_type);
      const acctRes = await client.query<{ account_number: string; account_name: string }>(
        `SELECT account_number, account_name FROM catalogs.accounts WHERE id = $1::uuid`,
        [correctAccount]
      );
      const a = acctRes.rows[0];
      console.log(
        `  ${r.reimbursement_id.slice(0, 8)} ${r.reimbursement_type.padEnd(6)} ${r.amount_cents.padStart(6)}c ` +
          `${r.settlement_display_id} -> ${a?.account_number} ${a?.account_name} (voided=${r.is_voided})`
      );
      totalCents += Number(r.amount_cents);
    }
    console.log(`  TOTAL: ${totalCents}c across ${reimbursementsRes.rows.length} reimbursements`);
    await client.release();
    await pool.end();
    process.exit(0);
  }

  // APPLY mode
  await client.query("BEGIN");
  let posted = 0;
  let skipped = 0;
  let totalCents = 0;

  for (const r of reimbursementsRes.rows) {
    const amountCents = Number(r.amount_cents);

    // ── Idempotency: check for an existing reclass JE for this reimbursement ────────────────────
    const existingRes = await client.query<{ je_id: string }>(
      `SELECT je.id::text AS je_id
         FROM accounting.journal_entries je
         JOIN accounting.journal_entry_postings jep ON jep.journal_entry_uuid = je.id
        WHERE je.operating_company_id = $1::uuid
          AND je.memo = $2
          AND jep.source_transaction_id = $3
        LIMIT 1`,
      [USMCA, `${RECLASS_MEMO_PREFIX} ${r.reimbursement_id}`, r.reimbursement_id]
    );
    if (existingRes.rows.length > 0) {
      skipped++;
      continue;
    }

    // ── Recompute the correct per-type account using the shared resolver ──────────────────────
    const correctAccountId = await resolveReimbursementExpenseAccount(client, USMCA, r.reimbursement_type);
    if (!correctAccountId) {
      throw new Error(
        `resolveReimbursementExpenseAccount returned null for type=${r.reimbursement_type} — ` +
          "the reimbursement_expense fallback role is not designated for USMCA; refusing to skip"
      );
    }
    if (correctAccountId === GENERIC_ACCOUNT_ID) {
      // The resolver fell back to the generic account — no reclass needed (lumper or unmapped type)
      console.log(
        `[ACCT-F26063-reclass] SKIP ${r.reimbursement_id.slice(0, 8)} ${r.reimbursement_type}: ` +
          "resolver returned the generic account (lumper or fallback) — no reclass needed"
      );
      skipped++;
      continue;
    }

    // ── Create the reclass JE through the real service function ────────────────────────────────
    // Credit the generic account (reversal of the old wrong debit) + Debit the correct account (repost).
    const je = await createJournalEntry(
      {
        operating_company_id: USMCA,
        entry_date: "2026-09-10",
        memo: `${RECLASS_MEMO_PREFIX} ${r.reimbursement_id}`,
        source: "auto",
        postings: [
          {
            account_id: correctAccountId,
            debit_or_credit: "debit",
            amount_cents: amountCents,
            description: `ACCT-F26063 repost — ${r.reimbursement_type} reimbursement ${r.reimbursement_id.slice(0, 8)} (${r.settlement_display_id})`,
          },
          {
            account_id: GENERIC_ACCOUNT_ID,
            debit_or_credit: "credit",
            amount_cents: amountCents,
            description: `ACCT-F26063 reversal — reimbursement ${r.reimbursement_id.slice(0, 8)} from generic (${r.settlement_display_id})`,
          },
        ],
      },
      { userId: ACTOR_USER_ID, role: "system" },
      { client, suppressSideEffects: true }
    );

    // ── Stamp source_transaction_id on the JEP lines for traceability + idempotency ────────────
    await client.query(
      `UPDATE accounting.journal_entry_postings
          SET source_transaction_type = 'driver_reimbursement',
              source_transaction_id = $1::text
        WHERE journal_entry_uuid = $2::uuid
          AND operating_company_id = $3::uuid`,
      [r.reimbursement_id, je.id, USMCA]
    );

    // ── Record the audit event ─────────────────────────────────────────────────────────────────
    await appendCrudAudit(
      client as never,
      ACTOR_USER_ID,
      "accounting.reimbursement_historical_reclass",
      {
        reimbursement_id: r.reimbursement_id,
        reimbursement_type: r.reimbursement_type,
        amount_cents: amountCents,
        settlement_id: r.settlement_id,
        settlement_display_id: r.settlement_display_id,
        close_je_id: r.close_je_id,
        reclass_je_id: je.id,
        from_account_id: GENERIC_ACCOUNT_ID,
        to_account_id: correctAccountId,
        is_voided: r.is_voided,
        reason: "ACCT-F26063 historical reclass: reimbursement posted to generic account instead of per-type account",
      },
      "info",
      "ACCT-F26063-HISTORICAL-RECLASS"
    );

    posted++;
    totalCents += amountCents;
    console.log(
      `[ACCT-F26063-reclass] POSTED ${r.reimbursement_id.slice(0, 8)} ${r.reimbursement_type.padEnd(6)} ` +
        `${amountCents}c -> JE ${je.id.slice(0, 8)} (${r.settlement_display_id})`
    );
  }

  await client.query("COMMIT");
  console.log(
    `[ACCT-F26063-reclass] DONE: posted=${posted} skipped=${skipped} total=${totalCents}c`
  );
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("[ACCT-F26063-reclass] FAILED:", err);
  process.exitCode = 1;
} finally {
  await client.release();
  await pool.end();
}
