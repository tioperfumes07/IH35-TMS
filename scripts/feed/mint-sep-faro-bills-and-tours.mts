#!/usr/bin/env tsx
/**
 * Mint missing Faro-load driver bills + tour_ids so Sep purchase days can close.
 *
 * Lawful sources only:
 *   - AT settlement_control driver_pay > 0 → createHistoricalDriverBill
 *   - AT salary $0 (5812 paperwork 13588/13600) → insert gross 0 open bill (5 live examples exist)
 *   - Unsettled Faro loads (no AT settlement yet) → SKIP (never invent pay)
 *
 * Usage:
 *   E11_LEAD_AUTH=1 npx tsx scripts/feed/mint-sep-faro-bills-and-tours.mts
 *   E11_LEAD_AUTH=1 npx tsx scripts/feed/mint-sep-faro-bills-and-tours.mts --apply
 */
import { withCurrentUser } from "../../apps/backend/src/auth/db.js";
import { setScopedCompanyContext } from "../../apps/backend/src/_helpers/scoped-company-context.js";
import { createHistoricalDriverBill } from "../../apps/backend/src/driver-finance/historical-driver-bill-backfill.service.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const APPLY = process.argv.includes("--apply");

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
if (APPLY && process.env.E11_LEAD_AUTH !== "1") throw new Error("set E11_LEAD_AUTH=1");

type CtrlLoad = {
  load: string;
  company_doc?: string;
  driver_doc?: string;
  driver_pay: number;
  loaded_miles?: number;
  empty_miles?: number;
};

async function main() {
  const sc = JSON.parse(readFileSync(join(process.cwd(), "scripts/feed/settlement_control.json"), "utf8")) as {
    loads: Record<string, CtrlLoad>;
  };

  await withCurrentUser(OWNER, async (c) => {
    await setScopedCompanyContext(c, OWNER, USMCA);
    const gaps = await c.query<{
      load_id: string;
      load_number: string;
      has_tour: boolean;
      has_bill: boolean;
      driver_id: string | null;
      miles_practical: string | null;
    }>(
      `WITH fa AS (
         SELECT DISTINCT i.source_load_id AS load_id
           FROM accounting.factoring_advances fa
           JOIN accounting.invoices i ON i.factoring_advance_id = fa.id AND i.voided_at IS NULL
          WHERE fa.operating_company_id = $1::uuid
            AND fa.voided_at IS NULL
            AND fa.faro_purchase_date BETWEEN '2026-09-01' AND '2026-09-21'
       )
       SELECT l.id::text AS load_id, l.load_number,
              (l.tour_id IS NOT NULL) AS has_tour,
              EXISTS (
                SELECT 1 FROM driver_finance.driver_bills db
                 WHERE db.load_id = l.id AND db.voided_at IS NULL
              ) AS has_bill,
              l.assigned_primary_driver_id::text AS driver_id,
              l.miles_practical::text
         FROM fa
         JOIN mdata.loads l ON l.id = fa.load_id
        WHERE l.tour_id IS NULL
           OR NOT EXISTS (
                SELECT 1 FROM driver_finance.driver_bills db
                 WHERE db.load_id = l.id AND db.voided_at IS NULL
              )
        ORDER BY l.load_number`,
      [USMCA]
    );

    console.log(`gaps: ${gaps.rows.length} apply=${APPLY}`);
    for (const g of gaps.rows) {
      const ctrl = sc.loads[g.load_number];
      const pay = ctrl ? Number(ctrl.driver_pay || 0) : null;
      const doc = ctrl ? String(ctrl.company_doc || ctrl.driver_doc || "") : "";
      console.log(
        `${g.load_number} tour=${g.has_tour} bill=${g.has_bill} ctrlPay=${pay} doc=${doc || "NO_AT_SETTLEMENT"} miles=${g.miles_practical}`
      );

      if (!APPLY) continue;

      if (!g.has_tour) {
        // Attach to settlement tour if on a settlement; else mint new tour UUID.
        const settTour = await c.query<{ tour_id: string | null }>(
          `SELECT l2.tour_id::text AS tour_id
             FROM driver_finance.settlement_lines sl
             JOIN driver_finance.driver_settlements ds ON ds.id = sl.settlement_id AND ds.voided_at IS NULL
             JOIN mdata.loads l2 ON l2.id = sl.load_id AND l2.tour_id IS NOT NULL
            WHERE sl.load_id = $1::uuid AND sl.is_active
            LIMIT 1`,
          [g.load_id]
        );
        // Prefer sibling load on same AT doc
        let tourId = settTour.rows[0]?.tour_id ?? null;
        if (!tourId && doc) {
          const sib = await c.query<{ tour_id: string }>(
            `SELECT l.tour_id::text AS tour_id
               FROM mdata.loads l
               JOIN driver_finance.settlement_lines sl ON sl.load_id = l.id AND sl.is_active
               JOIN driver_finance.driver_settlements ds ON ds.id = sl.settlement_id AND ds.voided_at IS NULL
              WHERE ds.operating_company_id = $1::uuid
                AND ds.source_document_ref = $2
                AND l.tour_id IS NOT NULL
              LIMIT 1`,
            [USMCA, doc]
          );
          tourId = sib.rows[0]?.tour_id ?? null;
        }
        if (!tourId) tourId = randomUUID();
        await c.query(`UPDATE mdata.loads SET tour_id = $2::uuid, updated_at = now() WHERE id = $1::uuid`, [
          g.load_id,
          tourId,
        ]);
        console.log(`  tour_id ${tourId}`);
      }

      if (g.has_bill) continue;
      if (!g.driver_id) {
        console.log(`  SKIP bill — no assigned_primary_driver_id`);
        continue;
      }

      if (pay == null) {
        console.log(`  SKIP bill — no AlwaysTrack settlement_control row (unsettled Faro load)`);
        continue;
      }

      if (pay > 0.005) {
        const loadedMiles = Number(ctrl!.loaded_miles || g.miles_practical || 0);
        const emptyMiles = Number(ctrl!.empty_miles || 0);
        const grossCents = Math.round(pay * 100);
        const rate = loadedMiles > 0 ? grossCents / loadedMiles : 0;
        const deadheadCents = Math.round(emptyMiles * rate);
        const loadedCents = grossCents - deadheadCents;
        // Ensure miles_shortest present for any downstream gate
        await c.query(
          `UPDATE mdata.loads
              SET miles_shortest = COALESCE(miles_shortest, miles_practical, $2::numeric),
                  updated_at = now()
            WHERE id = $1::uuid AND miles_shortest IS NULL`,
          [g.load_id, loadedMiles || null]
        );
        const bill = await createHistoricalDriverBill(c as never, {
          operating_company_id: USMCA,
          load_id: g.load_id,
          load_number: g.load_number,
          driver_id: g.driver_id,
          team_driver_id: null,
          gross_amount_cents: grossCents,
          loaded_pay_cents: loadedCents,
          deadhead_pay_cents: deadheadCents,
          miles_basis: loadedMiles,
          miles_basis_type: "practical",
          rate_per_mile_cents: Math.round(rate),
          miles_deadhead: emptyMiles,
          rate_empty_per_mile_cents: Math.round(rate),
          source_document_ref: doc || "AT-control",
          requesting_user_uuid: OWNER,
        });
        console.log(`  bill ${JSON.stringify(bill)}`);
        if (bill.outcome === "refused") throw new Error(bill.reason);
        continue;
      }

      // AT salary $0 (5812 paperwork) — insert open $0 bill (lawful; live DB already has zero-gross bills)
      const billNumber = `B-${g.load_number}`;
      await c.query(
        `INSERT INTO driver_finance.driver_bills (
           operating_company_id, load_id, load_number, bill_number, driver_id,
           gross_amount_cents, loaded_pay_cents, deadhead_pay_cents,
           miles_basis, miles_basis_type, rate_per_mile_cents, status, notes,
           created_by_user_id, is_sample_data, trace_no
         ) VALUES (
           $1::uuid, $2::uuid, $3, $4, $5::uuid,
           0, 0, 0,
           0, 'practical', 0, 'open',
           $6, $7::uuid, false, $8
         )
         ON CONFLICT DO NOTHING`,
        [
          USMCA,
          g.load_id,
          g.load_number,
          billNumber,
          g.driver_id,
          `AlwaysTrack settl ${doc}: salary $0 paperwork — gate outcome remint`,
          OWNER,
          `at-zero-pay:${g.load_number}`,
        ]
      );
      console.log(`  bill ${billNumber} gross=0 (AT salary 0)`);
    }
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
