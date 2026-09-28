#!/usr/bin/env tsx
/**
 * scripts/ops/2026-09-28-cc2-r157b-materialize-and-aggregate-5817-5818-5819.ts — completes the
 * AUTH-096 posting.
 *
 * ROOT CAUSE found live after posting: postSettlementCreatorInClientTx's bare-AlwaysTrack-digit
 * path (createBareSettlementForDocument) sets status='closed' at CREATION time, before any lines/
 * deductions/escrow exist. escrow (createHistoricalEscrowHold -> driver_finance.escrow_ledger) and
 * generic/admin-fee deductions (createSettlementDeduction -> driver_finance.driver_settlement_
 * deductions, applied_to_settlement_id set immediately by applyDeduction) both land correctly in
 * their OWN ledger tables -- the real money/liability is genuinely recorded, verified live -- but
 * neither ever becomes a driver_finance.settlement_lines row, because materializeSettlementLines
 * (a) only materializes an OPEN settlement (these are already 'closed') and (b) only picks up
 * driver_settlement_deductions rows where applied_to_settlement_id IS NULL (these are already
 * set). Two structurally different, non-composing code paths. Net effect: driver_settlements.
 * net_pay/gross_pay/deductions_total sat at $0.00 on all three post-commit, even though the GL
 * (accounting.journal_entry_postings) was already fully correct and balanced.
 *
 * FIX: write the missing settlement_lines rows directly, using the EXACT schema/column pattern
 * materializeSettlementLines itself uses (source_table/source_reference_id back-references to the
 * real escrow_ledger/driver_settlement_deductions rows, posting_account_id via the same
 * resolveDeductionPostingAccount this repo already uses for every other deduction line) -- not a
 * guess, not a plug, the real sanctioned resolution logic, just invoked directly instead of via a
 * function that structurally cannot reach these rows in this settlement's specific state. Then
 * calls aggregateSettlementTotals (the same function the settlements LIST screen's own read uses)
 * to write the real header totals from the now-complete line set.
 *
 * Idempotent: every INSERT is gated on NOT EXISTS for that source_reference_id; safe to re-run.
 *
 * Usage:
 *   DATABASE_URL=<prod> npx tsx scripts/ops/2026-09-28-cc2-r157b-materialize-and-aggregate-5817-5818-5819.ts --dry-run
 *   OWNER_AUTH_ID=AUTH-096 DATABASE_URL=<prod> npx tsx scripts/ops/2026-09-28-cc2-r157b-materialize-and-aggregate-5817-5818-5819.ts --apply
 */
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { resolveDeductionPostingAccount } from "../../apps/backend/src/driver-finance/settlement-lines-materialize.service.js";
import { SETTLEMENT_DEDUCTION_SOURCE_TABLE } from "../../apps/backend/src/driver-finance/deductions.service.js";
import { aggregateSettlementTotals } from "../../apps/backend/src/driver-finance/settlements-load-bookended.service.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const AUTH_ID = "AUTH-096";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const ESCROW_SOURCE_TABLE = "driver_finance.escrow_ledger";

const SETTLEMENT_IDS = [
  "2983941f-7396-48da-bdb9-8415243789ce", // 5817
  "ae0db193-3328-4934-b62b-f89a12a4df1c", // 5818
  "55306f73-4ec7-47b9-ba7b-3a2a14746256", // 5819
];

async function main() {
  const apply = process.argv.includes("--apply");
  if (apply && process.env.OWNER_AUTH_ID !== AUTH_ID) {
    console.error(`REFUSED: --apply requires OWNER_AUTH_ID=${AUTH_ID}.`);
    process.exit(1);
  }
  if (apply) {
    execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), AUTH_ID], { stdio: "inherit" });
  }

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3 });

  for (const settlementId of SETTLEMENT_IDS) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`SET LOCAL app.bypass_rls = 'lucia'`);
      await client.query(`SET LOCAL app.operating_company_id = '${USMCA}'`);

      const settRes = await client.query<{ driver_id: string; display_id: string }>(
        `SELECT driver_id::text, display_id FROM driver_finance.driver_settlements WHERE id = $1::uuid`,
        [settlementId],
      );
      const sett = settRes.rows[0];
      if (!sett) throw new Error(`settlement ${settlementId} not found`);
      console.log(`\n=== ${sett.display_id} (${settlementId}) ===`);

      // 1) Escrow -> settlement_lines(line_type='escrow_contribution'), idempotent on source_reference_id.
      const escrowRows = await client.query<{ id: string; load_id: string; amount_cents: string; description: string | null }>(
        `
          SELECT id::text, load_id::text, amount_cents, description
          FROM driver_finance.escrow_ledger
          WHERE driver_id = $1::uuid
            AND load_id IN (
              SELECT DISTINCT load_id FROM driver_finance.settlement_lines
              WHERE settlement_id = $2::uuid AND is_active = true AND load_id IS NOT NULL
            )
            AND amount_cents < 0
            AND NOT EXISTS (
              SELECT 1 FROM driver_finance.settlement_lines sl
              WHERE sl.source_table = $3 AND sl.source_reference_id::text = driver_finance.escrow_ledger.id::text
            )
        `,
        [sett.driver_id, settlementId, ESCROW_SOURCE_TABLE],
      );
      const escrowAcct = await resolveDeductionPostingAccount(client as never, USMCA, sett.driver_id, "escrow_contribution");
      for (const e of escrowRows.rows) {
        const amountCents = Math.abs(Math.round(Number(e.amount_cents)));
        const dollars = amountCents / 100;
        console.log(`  escrow_contribution: load ${e.load_id} $${dollars.toFixed(2)} (posting_account=${escrowAcct.postingAccountId ?? "UNRESOLVED"})`);
        if (apply) {
          await client.query(
            `
              INSERT INTO driver_finance.settlement_lines (
                settlement_id, line_type, description, amount, load_id, source_table, source_reference_id,
                posting_account_id, approval_status, is_active, is_sample_data
              )
              VALUES ($1::uuid, 'escrow_contribution', $2, $3, $4::uuid, $5, $6::uuid, $7::uuid, $8, true, false)
            `,
            [
              settlementId,
              e.description || "Escrow Contribution",
              dollars,
              e.load_id,
              ESCROW_SOURCE_TABLE,
              e.id,
              escrowAcct.postingAccountId,
              escrowAcct.postingAccountId ? "approved" : "pending",
            ],
          );
        }
      }

      // 2) driver_settlement_deductions -> settlement_lines(line_type='deduction'), idempotent.
      const dedRows = await client.query<{
        id: string;
        load_id: string | null;
        amount_cents: string;
        reason: string | null;
        deduction_type: string;
      }>(
        `
          SELECT id::text, load_id::text, amount_cents, reason, deduction_type
          FROM driver_finance.driver_settlement_deductions
          WHERE applied_to_settlement_id = $1::uuid
            AND voided_at IS NULL
            AND NOT EXISTS (
              SELECT 1 FROM driver_finance.settlement_lines sl
              WHERE sl.source_table = $2 AND sl.source_reference_id::text = driver_finance.driver_settlement_deductions.id::text
            )
        `,
        [settlementId, SETTLEMENT_DEDUCTION_SOURCE_TABLE],
      );
      for (const d of dedRows.rows) {
        const amountCents = Math.round(Number(d.amount_cents));
        const dollars = amountCents / 100;
        const acct = await resolveDeductionPostingAccount(client as never, USMCA, sett.driver_id, d.deduction_type);
        console.log(`  deduction: "${d.reason}" $${dollars.toFixed(2)} (posting_account=${acct.postingAccountId ?? "UNRESOLVED"})`);
        if (apply) {
          await client.query(
            `
              INSERT INTO driver_finance.settlement_lines (
                settlement_id, line_type, description, amount, load_id, source_table, source_reference_id,
                posting_account_id, approval_status, is_active, is_sample_data
              )
              VALUES ($1::uuid, 'deduction', $2, $3, $4::uuid, $5, $6::uuid, $7::uuid, $8, true, false)
            `,
            [
              settlementId,
              String(d.reason ?? "Settlement deduction").slice(0, 500),
              dollars,
              d.load_id,
              SETTLEMENT_DEDUCTION_SOURCE_TABLE,
              d.id,
              acct.postingAccountId,
              acct.postingAccountId ? "approved" : "pending",
            ],
          );
        }
      }

      if (apply) {
        const totals = await aggregateSettlementTotals(client as never, settlementId, USMCA);
        console.log(`  AGGREGATED: gross=${totals.gross_pay} deductions=${totals.deductions_total} reimbursements=${totals.reimbursements_total} net=${totals.net_pay}`);
        await client.query("COMMIT");
        console.log(`  COMMITTED.`);
      } else {
        console.log(`  DRY RUN — would insert the above lines and aggregate totals.`);
        await client.query("ROLLBACK");
      }
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      console.error(`  ERROR: ${err instanceof Error ? err.message : String(err)}`);
      if (apply) throw err;
    } finally {
      client.release();
    }
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
