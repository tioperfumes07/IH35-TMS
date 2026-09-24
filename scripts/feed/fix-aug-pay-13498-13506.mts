#!/usr/bin/env tsx
/**
 * Append missing driver pay for loads 13498 (doc 5769) and 13506 (doc 5775).
 * Live settlements were short exactly those AlwaysTrack loaded-miles amounts.
 *
 *   E11_LEAD_AUTH=1 npx tsx scripts/feed/fix-aug-pay-13498-13506.mts --apply
 */
import { withCurrentUser } from "../../apps/backend/src/auth/db.js";
import { setScopedCompanyContext } from "../../apps/backend/src/_helpers/scoped-company-context.js";
import { createHistoricalDriverBill } from "../../apps/backend/src/driver-finance/historical-driver-bill-backfill.service.js";
import { appendSettlementLineFromDriverBillIfMissing } from "../../apps/backend/src/driver-finance/settlement-engine.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const APPLY = process.argv.includes("--apply");

const JOBS = [
  { load: "13498", doc: "5769", pay_cents: 56876 }, // $568.76 loaded miles
  { load: "13506", doc: "5775", pay_cents: 58158 }, // $581.58 loaded miles
];

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
if (APPLY && process.env.E11_LEAD_AUTH !== "1" && !process.env.E11_AUTH_ID) {
  throw new Error("set E11_LEAD_AUTH=1");
}

async function main() {
  for (const job of JOBS) {
    console.log(`\n=== ${job.load} doc ${job.doc} $${job.pay_cents / 100} ===`);
    if (!APPLY) {
      console.log("DRY");
      continue;
    }
    await withCurrentUser(OWNER, async (c) => {
      await setScopedCompanyContext(c, OWNER, USMCA);
      const L = await c.query<{ id: string; driver_id: string | null }>(
        `SELECT id::text, assigned_primary_driver_id::text AS driver_id
           FROM mdata.loads
          WHERE operating_company_id=$1::uuid AND load_number=$2 AND soft_deleted_at IS NULL LIMIT 1`,
        [USMCA, job.load]
      );
      if (!L.rows[0]) throw new Error(`load ${job.load} missing`);
      let driverId = L.rows[0].driver_id;
      if (!driverId) {
        const ds = await c.query<{ driver_id: string }>(
          `SELECT driver_id::text FROM driver_finance.driver_settlements
            WHERE operating_company_id=$1::uuid AND source_document_ref=$2 AND voided_at IS NULL LIMIT 1`,
          [USMCA, job.doc]
        );
        driverId = ds.rows[0]?.driver_id ?? null;
      }
      if (!driverId) throw new Error(`no driver for ${job.load}`);

      let billId: string | null = null;
      const existingBill = await c.query<{ id: string; gross: string }>(
        `SELECT id::text, gross_amount_cents::text AS gross FROM driver_finance.driver_bills
          WHERE operating_company_id=$1::uuid AND load_number=$2 AND voided_at IS NULL LIMIT 1`,
        [USMCA, job.load]
      );
      if (existingBill.rows[0]) {
        billId = existingBill.rows[0].id;
        console.log("bill exists", billId, "gross_cents", existingBill.rows[0].gross);
        if (Number(existingBill.rows[0].gross) !== job.pay_cents) {
          await c.query(
            `UPDATE driver_finance.driver_bills
                SET gross_amount_cents=$2, loaded_pay_cents=$2, updated_at=now()
              WHERE id=$1::uuid`,
            [billId, job.pay_cents]
          );
          console.log("bill amount corrected to", job.pay_cents);
        }
      } else {
        const bill = await createHistoricalDriverBill(c as never, {
          operating_company_id: USMCA,
          load_id: L.rows[0].id,
          load_number: job.load,
          driver_id: driverId,
          gross_amount_cents: job.pay_cents,
          loaded_pay_cents: job.pay_cents,
          deadhead_pay_cents: 0,
          source_document_ref: job.doc,
          requesting_user_uuid: OWNER,
        });
        console.log("bill", bill);
        billId =
          bill.outcome === "created" || bill.outcome === "already_exists" ? bill.driver_bill_id : null;
      }
      if (!billId) throw new Error(`no bill id for ${job.load}`);

      const settl = await c.query<{ id: string; status: string }>(
        `SELECT id::text, status::text FROM driver_finance.driver_settlements
          WHERE operating_company_id=$1::uuid AND source_document_ref=$2 AND voided_at IS NULL LIMIT 1`,
        [USMCA, job.doc]
      );
      if (!settl.rows[0]) throw new Error(`settlement ${job.doc} missing`);

      await c.query(
        `UPDATE driver_finance.driver_bills
            SET settled_in_settlement_id = $1::uuid, updated_at = now()
          WHERE id = $2::uuid`,
        [settl.rows[0].id, billId]
      );

      // reopen if needed so append is allowed
      if (settl.rows[0].status === "approved" || settl.rows[0].status === "closed") {
        await c.query(
          `UPDATE driver_finance.driver_settlements
              SET status='open', posted_at=NULL, locked_at=NULL, updated_at=now()
            WHERE id=$1::uuid`,
          [settl.rows[0].id]
        );
        console.log("reopened", job.doc);
      }

      await appendSettlementLineFromDriverBillIfMissing(c as never, {
        operatingCompanyId: USMCA,
        settlementId: settl.rows[0].id,
        driverId,
        loadId: L.rows[0].id,
        actorUserId: OWNER,
      });
      console.log("append done");

      // recompute gross from earnings-class lines
      const sum = await c.query<{ s: string }>(
        `SELECT COALESCE(SUM(CASE WHEN line_type IN ('earnings','deadhead_pay','tarp_pay','extra_stop_pay','other_pay')
          THEN amount ELSE 0 END),0)::text AS s
           FROM driver_finance.settlement_lines
          WHERE settlement_id=$1::uuid AND voided_at IS NULL`,
        [settl.rows[0].id]
      );
      await c.query(
        `UPDATE driver_finance.driver_settlements
            SET gross_pay=$2::numeric, status='approved', updated_at=now()
          WHERE id=$1::uuid`,
        [settl.rows[0].id, sum.rows[0].s]
      );
      console.log("gross_pay now", sum.rows[0].s);
    });
  }
  console.log(APPLY ? "\nDONE apply" : "\nDRY done — pass --apply");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
