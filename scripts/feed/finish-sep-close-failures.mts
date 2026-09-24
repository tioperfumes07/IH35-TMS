#!/usr/bin/env tsx
/**
 * Simple finish for the 3 leftover Sep closes — no new GL math.
 *
 * 5807: Angel's escrow_accounts row pointed at the SHARED parent liability, not his
 *        per-driver sub-account. Rebind → close via canonical payrun.
 * 5812 / 5816: AlwaysTrack driver_pay=$0 (LH-only). No earnings to post. Stamp closed +
 *        mint company settlement alongside (same closeCompanySettlementAlongsideDriverSettlement).
 */
import { withCurrentUser } from "../../apps/backend/src/auth/db.js";
import { setScopedCompanyContext } from "../../apps/backend/src/_helpers/scoped-company-context.js";
import { closeCompanySettlementAlongsideDriverSettlement } from "../../apps/backend/src/accounting/company-settlement-close.service.js";
import { closeFedSettlementIfRequested } from "../../apps/backend/src/feed/ensure-settlement-from-fed-bills.service.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const ANGEL = "52037e93-484a-4659-ab60-cf2a78f4c647";
const ANGEL_ESCROW_SUB = "6974ef4b-1f48-40a0-b736-d3ceb4137859"; // "ANGEL ALFONSO SOSA — Driver Escrow"
const APPLY = process.argv.includes("--apply");

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
if (APPLY && process.env.E11_LEAD_AUTH !== "1" && !process.env.E11_AUTH_ID) {
  throw new Error("set E11_LEAD_AUTH=1 or E11_AUTH_ID");
}

async function settlementId(doc: string): Promise<string> {
  return withCurrentUser(OWNER, async (c) => {
    await setScopedCompanyContext(c, OWNER, USMCA);
    const r = await c.query<{ id: string }>(
      `SELECT id::text FROM driver_finance.driver_settlements
        WHERE operating_company_id=$1::uuid AND source_document_ref=$2 AND voided_at IS NULL
        ORDER BY created_at DESC LIMIT 1`,
      [USMCA, doc]
    );
    if (!r.rows[0]) throw new Error(`missing settl ${doc}`);
    return r.rows[0].id;
  });
}

async function main() {
  if (!APPLY) {
    console.log("DRY — --apply rebinds Angel escrow + closes 5807/5812/5816");
    return;
  }

  // 1) Rebind Angel escrow bridge to his per-driver LIABILITY sub-account.
  await withCurrentUser(OWNER, async (c) => {
    await setScopedCompanyContext(c, OWNER, USMCA);
    const u = await c.query(
      `UPDATE accounting.escrow_accounts
          SET coa_account_id = $1::uuid, updated_at = now()
        WHERE operating_company_id = $2::uuid
          AND holder_id = $3::uuid
          AND holder_type = 'driver'
          AND purpose = 'driver_bond'
        RETURNING id::text`,
      [ANGEL_ESCROW_SUB, USMCA, ANGEL]
    );
    console.log(`5807 escrow rebound rows=${u.rowCount} → ${ANGEL_ESCROW_SUB}`);
  });

  const id5807 = await settlementId("5807");
  const r5807 = await closeFedSettlementIfRequested({
    operatingCompanyId: USMCA,
    actorUserId: OWNER,
    settlementId: id5807,
    documentNumber: "5807",
    close: true,
  });
  console.log(`5807 posted=${r5807.settlementPosted} je=${r5807.journalEntryId} warn=${r5807.warnings.join("|")}`);

  // 2) Zero-pay AT docs — no driver pay to JE. Close paperwork + company settlement only.
  for (const doc of ["5812", "5816"] as const) {
    await withCurrentUser(OWNER, async (c) => {
      await setScopedCompanyContext(c, OWNER, USMCA);
      const id = await c.query<{ id: string }>(
        `SELECT id::text FROM driver_finance.driver_settlements
          WHERE operating_company_id=$1::uuid AND source_document_ref=$2 AND voided_at IS NULL LIMIT 1`,
        [USMCA, doc]
      );
      const settlementId = id.rows[0]!.id;
      // Drop escrow lines — nothing to withhold from $0 pay.
      await c.query(
        `UPDATE driver_finance.settlement_lines
            SET is_active = false, updated_at = now()
          WHERE settlement_id = $1::uuid AND is_active AND line_type = 'escrow_contribution'`,
        [settlementId]
      );
      await c.query(
        `UPDATE driver_finance.driver_settlements
            SET status = 'closed',
                trip_closed_at = COALESCE(trip_closed_at, now()),
                gross_pay = 0, deductions_total = 0, reimbursements_total = 0, net_pay = 0,
                updated_at = now()
          WHERE id = $1::uuid`,
        [settlementId]
      );
      const company = await closeCompanySettlementAlongsideDriverSettlement(c as never, {
        operatingCompanyId: USMCA,
        driverSettlementId: settlementId,
        actorUserId: OWNER,
      });
      console.log(`${doc} closed paperwork company=${company.display_id} status=${company.status}`);
    });
  }

  await withCurrentUser(OWNER, async (c) => {
    await setScopedCompanyContext(c, OWNER, USMCA);
    const census = await c.query(
      `SELECT
         count(*) FILTER (WHERE status='open')::int AS open_n,
         count(*) FILTER (WHERE status IN ('approved','closed','paid','final','locked'))::int AS closed_n,
         count(*) FILTER (WHERE COALESCE(gross_pay,0)=0 AND status IN ('approved','closed'))::int AS zero_closed
       FROM driver_finance.driver_settlements
       WHERE operating_company_id=$1::uuid AND voided_at IS NULL
         AND source_document_ref ~ '^[0-9]+$'
         AND source_document_ref::int BETWEEN 5769 AND 5816`,
      [USMCA]
    );
    console.log("CENSUS 5769-5816", census.rows[0]);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
