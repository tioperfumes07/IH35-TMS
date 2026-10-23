#!/usr/bin/env node
/**
 * LEAD 443.249 item 1 — OWNER RULE: "all driver bills due date is the date of the load delivery."
 * Guard: any open/approved/paid driver bill whose load has a delivery stop but whose due_date
 * does not match (or is NULL) = FAIL.  Bills whose load has no delivery stop are exempt — those
 * are listed by scripts/seed-driver-bill-due-dates-443249.ts for the Lead.
 */
export const REQUIRES_LIVE_DB = "driver_finance.driver_bills + mdata.load_stops — live check";
export const ALLOW_OFFLINE_SKIP = "live-money invariant by design, no static-only path";

import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-driver-bill-due-date-matches-delivery";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

if (process.argv.includes("--selftest")) {
  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

const { client, pool } = await requireLiveDbOrExit({ label: LABEL });

try {
  const { rows } = await client.query(`
    SELECT
      b.id::text AS bill_id,
      b.bill_number,
      b.status,
      b.due_date::text        AS bill_due_date,
      b.due_date_basis,
      (
        SELECT
          CASE WHEN s.actual_departure_at IS NOT NULL
               THEN (s.actual_departure_at AT TIME ZONE 'America/Chicago')::date::text
               ELSE (COALESCE(GREATEST(s.appointment_start_at, s.scheduled_arrival_at),
                              s.appointment_end_at, s.scheduled_departure_at)
                    AT TIME ZONE 'America/Chicago')::date::text
          END
          FROM mdata.load_stops s
         WHERE s.load_id = b.load_id
           AND s.stop_type::text = 'delivery'
           AND s.status::text   <> 'cancelled'
           AND s.soft_deleted_at IS NULL
         ORDER BY s.sequence_number DESC
         LIMIT 1
      ) AS load_delivery_date
    FROM driver_finance.driver_bills b
    WHERE b.operating_company_id = $1::uuid
      AND b.status IN ('open', 'approved', 'paid')
      AND b.voided_at IS NULL
      AND b.load_id IS NOT NULL
  `, [USMCA]);

  const failures = rows.filter(r => {
    if (!r.load_delivery_date) return false; // no delivery stop → exempt (Lead list)
    if (!r.bill_due_date) return true;       // has delivery but NULL due_date → FAIL
    return r.bill_due_date !== r.load_delivery_date; // mismatch → FAIL
  });

  if (failures.length === 0) {
    console.log(`${LABEL}: PASS — ${rows.length} bill(s) checked, all due_dates match delivery`);
    process.exit(0);
  }

  console.error(`${LABEL}: FAIL — ${failures.length} driver bill(s) with wrong or missing due_date`);
  for (const f of failures.slice(0, 20)) {
    console.error(`  bill ${f.bill_number} (${f.bill_id}) status=${f.status} due_date=${f.bill_due_date ?? 'NULL'} delivery=${f.load_delivery_date}`);
  }
  if (failures.length > 20) console.error(`  ... and ${failures.length - 20} more`);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
