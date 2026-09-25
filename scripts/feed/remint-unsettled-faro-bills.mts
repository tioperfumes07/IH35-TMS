#!/usr/bin/env tsx
/**
 * Remint purged driver bills for Sep Faro loads that have no AlwaysTrack
 * settlement yet — same createDriverBillArtifacts path as the original seed
 * (Cursor-2026-09-06-ACTIVE-LOADS-SEED). Restores gate outcomes; does not invent pay.
 *
 * Usage:
 *   E11_LEAD_AUTH=1 npx tsx scripts/feed/remint-unsettled-faro-bills.mts
 *   E11_LEAD_AUTH=1 npx tsx scripts/feed/remint-unsettled-faro-bills.mts --apply
 */
import { withCurrentUser } from "../../apps/backend/src/auth/db.js";
import { setScopedCompanyContext } from "../../apps/backend/src/_helpers/scoped-company-context.js";
import { createDriverBillArtifacts } from "../../apps/backend/src/dispatch/book-load.service.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const APPLY = process.argv.includes("--apply");
const LOADS = ["13563", "13610", "13612", "13613", "13614", "13615", "13619"];

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
if (APPLY && process.env.E11_LEAD_AUTH !== "1") throw new Error("set E11_LEAD_AUTH=1");

async function main() {
  await withCurrentUser(OWNER, async (c) => {
    await setScopedCompanyContext(c, OWNER, USMCA);
    for (const ln of LOADS) {
      const lr = await c.query<{
        id: string;
        load_number: string;
        assigned_primary_driver_id: string | null;
        miles_practical: string | null;
        miles_shortest: string | null;
        assigned_unit_id: string | null;
        status: string;
      }>(
        `SELECT id::text, load_number, assigned_primary_driver_id::text,
                miles_practical::text, miles_shortest::text, assigned_unit_id::text, status
           FROM mdata.loads WHERE operating_company_id=$1::uuid AND load_number=$2`,
        [USMCA, ln]
      );
      const l = lr.rows[0];
      if (!l) {
        console.log(ln, "MISSING");
        continue;
      }
      const existing = await c.query<{ bill_number: string; gross_amount_cents: number }>(
        `SELECT bill_number, gross_amount_cents FROM driver_finance.driver_bills
          WHERE load_id=$1::uuid AND voided_at IS NULL LIMIT 1`,
        [l.id]
      );
      if (existing.rows[0]) {
        console.log(ln, "already", existing.rows[0]);
        continue;
      }
      if (!l.assigned_primary_driver_id) {
        console.log(ln, "NO DRIVER");
        continue;
      }
      let milesShort = l.miles_shortest ? Number(l.miles_shortest) : null;
      if ((milesShort == null || milesShort <= 0) && l.miles_practical && Number(l.miles_practical) > 0) {
        milesShort = Number(l.miles_practical);
        if (APPLY) {
          await c.query(
            `UPDATE mdata.loads SET miles_shortest=$2::numeric, updated_at=now() WHERE id=$1::uuid`,
            [l.id, milesShort]
          );
        }
      }
      if (milesShort == null || milesShort <= 0) {
        console.log(ln, "SKIP zero miles");
        continue;
      }
      console.log(ln, `DRY remint miles=${milesShort} apply=${APPLY}`);
      if (!APPLY) continue;

      const stops = await c.query(
        `SELECT stop_type, sequence_number AS sequence, city, state,
                scheduled_arrival_at::text AS planned_arrival_at
           FROM mdata.load_stops WHERE load_id=$1::uuid ORDER BY sequence_number`,
        [l.id]
      );
      const input = {
        operating_company_id: USMCA,
        assigned_primary_driver_id: l.assigned_primary_driver_id,
        assigned_unit_id: l.assigned_unit_id,
        requesting_user_uuid: OWNER,
      };
      const loadRow = {
        id: l.id,
        load_number: l.load_number,
        miles_shortest: milesShort,
        miles_practical: Number(l.miles_practical || milesShort),
        status: l.status,
      };
      const out = await createDriverBillArtifacts(
        c as never,
        input as never,
        loadRow as never,
        l.load_number,
        (stops.rows.length ? stops.rows : []) as never
      );
      console.log(ln, JSON.stringify(out));
      if (out.outcome === "refused") throw new Error(`${ln}: ${out.reason}`);
    }
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
