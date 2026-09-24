#!/usr/bin/env tsx
/**
 * Correct pure-Aug AlwaysTrack escrow on posted settlements 5769–5796.
 *
 * Measured 2026-09-24:
 *   ctrl escrow = $875 (35 × $25) from AT deduction lines
 *   live escrow_contribution lines = $1,125 (+$250)
 * Zero-AT-escrow docs that still got close-path $25/load:
 *   5770,5771,5777,5780,5783,5786,5796 (extras)
 * Missing one $25 each: 5769, 5775
 *
 * Does NOT touch banking. Settlements are already posted — this uses releaseEscrow +
 * createHistoricalEscrowHold + settlement_lines is_active flip (void-not-delete), never DELETE.
 *
 * Usage:
 *   E11_LEAD_AUTH=1 npx tsx scripts/feed/correct-aug-escrow-to-at.mts
 *   E11_LEAD_AUTH=1 npx tsx scripts/feed/correct-aug-escrow-to-at.mts --apply
 */
import { withCurrentUser } from "../../apps/backend/src/auth/db.js";
import { setScopedCompanyContext } from "../../apps/backend/src/_helpers/scoped-company-context.js";
import { releaseEscrow } from "../../apps/backend/src/accounting/escrow/service.js";
import { createHistoricalEscrowHold } from "../../apps/backend/src/driver-finance/historical-escrow-backfill.service.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const APPLY = process.argv.includes("--apply");

/** AT ctrl escrow dollars by settlement_no (pure-Aug only). */
const CTRL_ESCROW: Record<string, number> = {
  "5769": 50,
  "5770": 0,
  "5771": 0,
  "5772": 100,
  "5774": 50,
  "5775": 75,
  "5776": 75,
  "5777": 0,
  "5778": 50,
  "5779": 50,
  "5780": 0,
  "5781": 50,
  "5782": 50,
  "5783": 0,
  "5784": 75,
  "5785": 75,
  "5786": 0,
  "5787": 50,
  "5788": 75,
  "5795": 50,
  "5796": 0,
};

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
if (APPLY && process.env.E11_LEAD_AUTH !== "1") throw new Error("set E11_LEAD_AUTH=1");

async function main() {
  await withCurrentUser(OWNER, async (c) => {
    await setScopedCompanyContext(c, OWNER, USMCA);

    const live = await c.query<{
      ref: string;
      settlement_id: string;
      driver_id: string;
      live_escrow: string;
      n: string;
    }>(
      `SELECT s.source_document_ref AS ref, s.id::text AS settlement_id, s.driver_id::text,
              COALESCE(SUM(sl.amount) FILTER (WHERE sl.line_type='escrow_contribution' AND COALESCE(sl.is_active,true)),0)::text AS live_escrow,
              COUNT(*) FILTER (WHERE sl.line_type='escrow_contribution' AND COALESCE(sl.is_active,true))::text AS n
         FROM driver_finance.driver_settlements s
         LEFT JOIN driver_finance.settlement_lines sl ON sl.settlement_id = s.id
        WHERE s.operating_company_id=$1::uuid
          AND s.source_document_ref = ANY($2::text[])
          AND s.voided_at IS NULL
        GROUP BY s.source_document_ref, s.id, s.driver_id
        ORDER BY s.source_document_ref`,
      [USMCA, Object.keys(CTRL_ESCROW)]
    );

    let liveTotal = 0;
    let ctrlTotal = 0;
    for (const row of live.rows) {
      const liveAmt = Number(row.live_escrow);
      const ctrlAmt = CTRL_ESCROW[row.ref] ?? 0;
      liveTotal += liveAmt;
      ctrlTotal += ctrlAmt;
      const delta = liveAmt - ctrlAmt;
      if (Math.abs(delta) < 0.005) continue;
      console.log(
        `${row.ref} live=$${liveAmt} ctrl=$${ctrlAmt} delta=$${delta} lines=${row.n} driver=${row.driver_id}`
      );

      if (delta > 0) {
        // Excess: deactivate newest excess escrow_contribution lines + release GL.
        const excessLines = await c.query<{ id: string; amount: string; load_id: string | null }>(
          `SELECT sl.id::text, sl.amount::text, sl.load_id::text
             FROM driver_finance.settlement_lines sl
            WHERE sl.settlement_id=$1::uuid AND sl.line_type='escrow_contribution'
              AND COALESCE(sl.is_active,true)
            ORDER BY sl.created_at DESC`,
          [row.settlement_id]
        );
        let remaining = delta;
        for (const line of excessLines.rows) {
          if (remaining < 0.005) break;
          const amt = Number(line.amount);
          console.log(`  RELEASE/DEACTIVATE line ${line.id} $${amt}`);
          if (!APPLY) continue;
          await c.query(
            `UPDATE driver_finance.settlement_lines
                SET is_active = false, updated_at = now()
              WHERE id = $1::uuid`,
            [line.id]
          );
          const escAcct = await c.query<{ id: string }>(
            `SELECT id::text FROM accounting.escrow_accounts
              WHERE holder_id=$1::uuid AND holder_type='driver' AND status='active' LIMIT 1`,
            [row.driver_id]
          );
          if (escAcct.rows[0]) {
            await releaseEscrow(
              {
                operating_company_id: USMCA,
                escrow_account_id: escAcct.rows[0].id,
                amount_cents: Math.round(amt * 100),
                source_type: "reconciliation",
                note: `AT ctrl escrow $0 on settl ${row.ref} — reverse close-path excess`,
              },
              { userId: OWNER, role: "Owner" }
            );
            // releaseEscrow moves GL; keep driver_finance.escrow_balances in lockstep
            // (verify-escrow-balance-reconciles-gl — accounting.escrow_accounts is canonical).
            const proj = await c.query<{ id: string; bal: string }>(
              `SELECT id::text, current_balance_cents::text AS bal
                 FROM driver_finance.escrow_balances WHERE driver_id=$1::uuid LIMIT 1`,
              [row.driver_id]
            );
            if (proj.rows[0]) {
              const releaseCents = Math.round(amt * 100);
              const newBal = Math.max(0, Number(proj.rows[0].bal) - releaseCents);
              await c.query(
                `UPDATE driver_finance.escrow_balances
                    SET current_balance_cents = $2,
                        total_released_cents = COALESCE(total_released_cents,0) + $3,
                        last_updated_at = now()
                  WHERE id = $1::uuid`,
                [proj.rows[0].id, newBal, releaseCents]
              );
              await c.query(
                `INSERT INTO driver_finance.escrow_ledger
                   (operating_company_id, driver_id, escrow_balance_id, transaction_type, amount_cents,
                    running_balance_cents, description)
                 VALUES ($1::uuid, $2::uuid, $3::uuid, 'release', $4, $5,
                   $6)`,
                [
                  USMCA,
                  row.driver_id,
                  proj.rows[0].id,
                  -releaseCents,
                  newBal,
                  `Projection sync after AT escrow excess release settl ${row.ref}`,
                ]
              );
            }
          }
          remaining -= amt;
        }
      } else if (delta < 0) {
        const need = Math.abs(delta);
        console.log(`  NEED HOLD $${need} on settl ${row.ref}`);
        if (!APPLY) continue;
        // Pick a load on this settlement missing an active escrow line.
        const load = await c.query<{ load_id: string }>(
          `SELECT DISTINCT sl.load_id::text AS load_id
             FROM driver_finance.settlement_lines sl
            WHERE sl.settlement_id=$1::uuid AND sl.load_id IS NOT NULL
              AND NOT EXISTS (
                SELECT 1 FROM driver_finance.settlement_lines e
                 WHERE e.settlement_id=sl.settlement_id AND e.load_id=sl.load_id
                   AND e.line_type='escrow_contribution' AND COALESCE(e.is_active,true)
              )
            LIMIT 1`,
          [row.settlement_id]
        );
        if (!load.rows[0]?.load_id) {
          console.log(`  REFUSE ${row.ref}: no load without escrow line`);
          continue;
        }
        await createHistoricalEscrowHold(c as never, {
          source: "historical_backfill",
          operating_company_id: USMCA,
          driver_id: row.driver_id,
          load_id: load.rows[0].load_id,
          description: `Driver-Escrow For Claims — settl ${row.ref} AT ctrl backfill`,
          amount_cents: Math.round(need * 100),
          actor_user_id: OWNER,
        });
      }
    }

    console.log(`TOTALS live=$${liveTotal} ctrl=$${ctrlTotal} delta=$${liveTotal - ctrlTotal}`);
    if (!APPLY) console.log("DRY — pass --apply to release/hold");
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
