#!/usr/bin/env -S npx tsx
/**
 * ROUND 178/182 — bulk-mint driver_finance.driver_bills for the 15 currently-unbilled USMCA loads
 * (13622, 13624-13630, 13632-13633, 13635-13639), calling the SAME sanctioned engine every booking/
 * dispatch/close path already calls (ensureDriverBillArtifactsForLoad -> createDriverBillArtifacts
 * -> resolveDriverBasePayCents in ../src/dispatch/book-load.service.ts) rather than re-deriving the
 * MILES SPEC formula by hand. This is the PRE-SETTLEMENT ESTIMATE the Lead ordered (2026-09-28,
 * ROUND 178 follow-up): it prices off whatever miles/rate-card are on the load TODAY and is
 * expected to recalculate when real mileage is entered at close — it is deliberately NOT required
 * to reproduce the two already-closed reference bills (13631, 13634), which priced off a DIFFERENT,
 * now-drifted miles_shortest snapshot (see docs/bus/09-28-2026-CC-2-ROUND-177-...-STOP.md).
 *
 * Runs each load's mint inside its own BEGIN/COMMIT (createDriverBillArtifacts takes a
 * pg_advisory_xact_lock, which only means anything inside a transaction). --apply COMMITs;
 * otherwise every transaction ROLLBACKs after reporting what WOULD have happened, so a dry run
 * shows the real engine's real decision, not a hand-simulated guess.
 *
 * Run: DATABASE_URL=<prod> npx tsx scripts/ops-r178-mint-driver-bills.ts [--apply]
 * (run from apps/backend/ so the relative import below resolves)
 */
import pg from "pg";
import { ensureDriverBillArtifactsForLoad } from "../src/dispatch/book-load.service.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
// Same owner identity.users id used by this session's precedent ops script
// (scripts/ops/2026-09-28-cc2-r181-categorize-relay-topups.ts) — verified live there.
const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const TARGET_LOAD_NUMBERS = [
  "13622", "13624", "13625", "13626", "13627", "13628", "13629", "13630",
  "13632", "13633", "13635", "13636", "13637", "13638", "13639",
];
const APPLY = process.argv.includes("--apply");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required");
  const actorUserId = OWNER_USER_ID;

  const pool = new pg.Pool({ connectionString: url, max: 2 });
  const outer = await pool.connect();
  const loadsRes = await outer.query<{ id: string; load_number: string }>(
    `SELECT id::text, load_number
       FROM mdata.loads
      WHERE operating_company_id = $1::uuid
        AND load_number = ANY($2::text[])
        AND soft_deleted_at IS NULL
      ORDER BY load_number`,
    [USMCA, TARGET_LOAD_NUMBERS]
  );
  outer.release();

  console.log(`Resolved ${loadsRes.rows.length} of ${TARGET_LOAD_NUMBERS.length} target loads. actorUserId=${actorUserId}`);
  console.log(APPLY ? "APPLY MODE — bills will be committed." : "DRY RUN — every transaction will ROLLBACK.");

  const results: Array<{ load_number: string; outcome: unknown; gross_amount_cents?: number; loaded?: number; deadhead?: number }> = [];

  for (const row of loadsRes.rows) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`SELECT set_config('app.bypass_rls','lucia',true)`);
      const outcome = await ensureDriverBillArtifactsForLoad(client, {
        loadId: row.id,
        operatingCompanyId: USMCA,
        actorUserId: String(actorUserId),
      });
      const billRes = await client.query<{
        gross_amount_cents: number;
        loaded_pay_cents: number;
        deadhead_pay_cents: number;
        miles_basis: string;
        rate_per_mile_cents: number;
      }>(
        `SELECT gross_amount_cents, loaded_pay_cents, deadhead_pay_cents, miles_basis::text, rate_per_mile_cents
           FROM driver_finance.driver_bills
          WHERE load_id = $1::uuid AND operating_company_id = $2::uuid AND voided_at IS NULL
          ORDER BY created_at DESC LIMIT 1`,
        [row.id, USMCA]
      );
      results.push({
        load_number: row.load_number,
        outcome,
        gross_amount_cents: billRes.rows[0]?.gross_amount_cents,
        loaded: billRes.rows[0]?.loaded_pay_cents,
        deadhead: billRes.rows[0]?.deadhead_pay_cents,
      });
      if (APPLY) {
        await client.query("COMMIT");
      } else {
        await client.query("ROLLBACK");
      }
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      results.push({ load_number: row.load_number, outcome: { error: String(err) } });
    } finally {
      client.release();
    }
  }

  console.log(JSON.stringify(results, null, 2));
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
