#!/usr/bin/env tsx
/**
 * Correct mistaken Alfonso Hidalgo escrow/admin attributed to TRANSP twin dcd683f5
 * instead of USMCA twin 40823a77 (completer name-map bug, fixed same session).
 *
 * Void-not-delete: release GL escrow, reverse driver_finance projection, void admin deductions.
 *
 * Usage: E11_LEAD_AUTH=1 npx tsx scripts/feed/correct-alfonso-transp-escrow-misattr.mts --apply
 */
import { withCurrentUser } from "../../apps/backend/src/auth/db.js";
import { setScopedCompanyContext } from "../../apps/backend/src/_helpers/scoped-company-context.js";
import { releaseEscrow } from "../../apps/backend/src/accounting/escrow/service.js";
import { voidSettlementDeduction } from "../../apps/backend/src/driver-finance/settlement-deduction-void.service.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const TRANSP_ALFONSO = "dcd683f5-b8a1-46a8-aa6b-093732e70b92";
const APPLY = process.argv.includes("--apply");

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
if (APPLY && process.env.E11_LEAD_AUTH !== "1") throw new Error("set E11_LEAD_AUTH=1");

async function main() {
  const lines: string[] = [];
  await withCurrentUser(OWNER, async (c) => {
    await setScopedCompanyContext(c, OWNER, USMCA);

    const gl = await c.query<{ id: string; balance_cents: string }>(
      `SELECT id::text, balance_cents::text FROM accounting.escrow_accounts
        WHERE holder_id=$1::uuid AND holder_type='driver' AND status='active' LIMIT 1`,
      [TRANSP_ALFONSO]
    );
    const bal = await c.query<{ id: string; current_balance_cents: number }>(
      `SELECT id::text, current_balance_cents FROM driver_finance.escrow_balances
        WHERE driver_id=$1::uuid LIMIT 1`,
      [TRANSP_ALFONSO]
    );
    const admins = await c.query<{ id: string; reason: string }>(
      `SELECT id::text, reason FROM driver_finance.driver_settlement_deductions
        WHERE driver_id=$1::uuid AND voided_at IS NULL
          AND reason ILIKE 'AlwaysTrack settl%'`,
      [TRANSP_ALFONSO]
    );

    lines.push(
      `TRANSP Alfonso GL=${gl.rows[0]?.balance_cents ?? "none"} projection=${bal.rows[0]?.current_balance_cents ?? "none"} admins=${admins.rows.length}`
    );

    if (!APPLY) {
      lines.push("DRY — pass --apply to release GL, reverse projection, void admins");
      return;
    }

    const glBal = Number(gl.rows[0]?.balance_cents ?? 0);
    if (gl.rows[0] && glBal > 0) {
      const rel = await releaseEscrow(
        {
          operating_company_id: USMCA,
          escrow_account_id: gl.rows[0].id,
          amount_cents: glBal,
          source_type: "reconciliation",
          note: "Reverse mis-attributed historical escrow on TRANSP Alfonso twin; USMCA twin 40823a77 holds the real settl 5775/5787 holds",
        },
        { userId: OWNER, role: "Owner" }
      );
      lines.push(`GL RELEASE ${JSON.stringify(rel).slice(0, 200)}`);
    }

    if (bal.rows[0] && Number(bal.rows[0].current_balance_cents) > 0) {
      const amt = Number(bal.rows[0].current_balance_cents);
      await c.query(
        `UPDATE driver_finance.escrow_balances
            SET current_balance_cents = 0,
                total_released_cents = COALESCE(total_released_cents,0) + $2,
                last_updated_at = now()
          WHERE id = $1::uuid`,
        [bal.rows[0].id, amt]
      );
      await c.query(
        `INSERT INTO driver_finance.escrow_ledger
           (operating_company_id, driver_id, escrow_balance_id, transaction_type, amount_cents,
            running_balance_cents, description)
         VALUES ($1::uuid, $2::uuid, $3::uuid, 'release', $4, 0,
           'Reverse mis-attributed TRANSP-twin escrow — real holds on USMCA Alfonso 40823a77')`,
        [USMCA, TRANSP_ALFONSO, bal.rows[0].id, -amt]
      );
      lines.push(`PROJECTION zeroed + release ledger ${amt} cents`);
    }

    for (const a of admins.rows) {
      await voidSettlementDeduction(c as never, {
        operating_company_id: USMCA,
        deduction_id: a.id,
        reason: "Mis-attributed to TRANSP Alfonso twin; re-seeded on USMCA twin",
        actor_user_id: OWNER,
      });
      lines.push(`VOID ADMIN ${a.id} ${a.reason.slice(0, 60)}`);
    }
  });
  for (const l of lines) console.log(l);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
