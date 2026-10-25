#!/usr/bin/env node
/**
 * ENG-43 data repair — recompute gross_pay/net_pay for 4 USMCA open settlements whose
 * header was never updated when earnings lines were added (P-0079, P-0112, P-0114, P-0116).
 *
 * Root cause: lines were added through a path that did not call recomputeSettlementHeader.
 * Service fix: settlement-payrun-close.service.ts already refuses to post a settlement with
 * zero active lines (SETTLEMENT_HAS_NO_LIVE_LINES). settlement-pay-line.service.ts calls
 * recomputeSettlementHeader on line mutations going forward.
 *
 * Dry-run by default. Pass --apply to commit.
 *
 * Safety:
 * - Only touches open (not posted, not closed, not voided) settlements
 * - Only updates settlements where gross_pay = 0 AND active earnings lines exist
 * - TB must be 0 before and after (metadata-only: no GL rows touched)
 * - Rolls back on any mismatch
 *
 * Usage:
 *   node scripts/ops/repair-settlement-header-eng43.mjs            # dry run
 *   node scripts/ops/repair-settlement-header-eng43.mjs --apply    # apply
 */
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { Pool } = require("pg");
const pgOpts = require("../lib/pg-connection-options.cjs");

const APPLY = process.argv.includes("--apply");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

const pool = new Pool(pgOpts);
const client = await pool.connect();

try {
  await client.query("BEGIN");
  await client.query("SET LOCAL app.bypass_rls = 'lucia'");

  const tbBefore = await client.query(`
    SELECT COALESCE(sum(CASE WHEN debit_or_credit='debit' THEN amount_cents ELSE -amount_cents END),0)::text AS net,
           count(*)::text AS n
    FROM accounting.journal_entry_postings WHERE operating_company_id = $1::uuid
  `, [USMCA]);
  if (tbBefore.rows[0].net !== "0") {
    throw new Error(`TB non-zero before repair: ${tbBefore.rows[0].net}`);
  }

  // Find open settlements with gross_pay=0 but earnings lines
  const targets = await client.query(`
    SELECT ds.id::text, ds.display_id, ds.status,
      SUM(CASE WHEN sl.line_type IN ('earnings','extra_pay','team_split_primary','team_split_secondary','deadhead_pay')
               AND sl.is_active = true AND sl.voided_at IS NULL THEN sl.amount ELSE 0 END)::text AS expected_gross,
      SUM(CASE WHEN sl.line_type IN ('deduction','abandonment_chargeback','escrow_contribution')
               AND sl.is_active = true AND sl.voided_at IS NULL THEN sl.amount ELSE 0 END)::text AS expected_deductions,
      SUM(CASE WHEN sl.line_type IN ('reimbursement','dispute_adjustment')
               AND sl.is_active = true AND sl.voided_at IS NULL THEN sl.amount ELSE 0 END)::text AS expected_reimbursements
    FROM driver_finance.driver_settlements ds
    JOIN driver_finance.settlement_lines sl ON sl.settlement_id = ds.id
    WHERE ds.operating_company_id = $1::uuid
      AND ds.voided_at IS NULL
      AND ds.posted_at IS NULL
      AND ds.gross_pay = 0
    GROUP BY ds.id, ds.display_id, ds.status
    HAVING SUM(CASE WHEN sl.line_type IN ('earnings','extra_pay','team_split_primary','team_split_secondary','deadhead_pay')
                    AND sl.is_active = true AND sl.voided_at IS NULL THEN sl.amount ELSE 0 END) > 0
    ORDER BY ds.display_id
  `, [USMCA]);

  console.log(`Found ${targets.rows.length} settlement(s) with stale $0 header:`);
  for (const r of targets.rows) {
    console.log(`  ${r.display_id} (${r.status}): gross=${r.expected_gross}, deductions=${r.expected_deductions}, reimb=${r.expected_reimbursements}`);
  }

  if (targets.rows.length === 0) {
    console.log("Nothing to repair.");
    await client.query("ROLLBACK");
    process.exit(0);
  }

  for (const r of targets.rows) {
    const gross = Number(r.expected_gross);
    const deductions = Number(r.expected_deductions);
    const reimbursements = Number(r.expected_reimbursements);
    const net = gross - deductions + reimbursements;

    await client.query(`
      UPDATE driver_finance.driver_settlements
         SET gross_pay = $2::numeric, deductions_total = $3::numeric,
             reimbursements_total = $4::numeric, net_pay = $5::numeric,
             updated_at = now()
       WHERE id = $1::uuid AND operating_company_id = $6::uuid
    `, [r.id, gross.toFixed(2), deductions.toFixed(2), reimbursements.toFixed(2), net.toFixed(2), USMCA]);
  }

  // Verify TB unchanged (metadata only — no GL rows touched)
  const tbAfter = await client.query(`
    SELECT COALESCE(sum(CASE WHEN debit_or_credit='debit' THEN amount_cents ELSE -amount_cents END),0)::text AS net,
           count(*)::text AS n
    FROM accounting.journal_entry_postings WHERE operating_company_id = $1::uuid
  `, [USMCA]);
  if (tbAfter.rows[0].net !== "0" || tbAfter.rows[0].n !== tbBefore.rows[0].n) {
    throw new Error(`TB changed after repair: before ${tbBefore.rows[0].net}/${tbBefore.rows[0].n}, after ${tbAfter.rows[0].net}/${tbAfter.rows[0].n}`);
  }

  if (APPLY) {
    await client.query("COMMIT");
    console.log(`APPLIED: ${targets.rows.length} settlement header(s) repaired.`);
  } else {
    await client.query("ROLLBACK");
    console.log(`DRY RUN: ${targets.rows.length} settlement header(s) would be repaired. Pass --apply to commit.`);
  }
} catch (err) {
  await client.query("ROLLBACK");
  console.error("REPAIR FAILED:", err.message);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
