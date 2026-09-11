#!/usr/bin/env tsx
/**
 * scripts/ops/cursor-2026-09-10-seed-13588.mts — Thursday AllwaysTrack catch-up (owner order
 * 2026-09-10, THURSDAY-CATCHUP-2026-09-10.md §C): seed the ONE open-board load that resolves with
 * ZERO guessed values, at rate $0 (owner: "seed at $0, edit amounts later").
 *
 * Load 13588 — driver Luis Armando Sosa Perez (T170, currently FREE), customer Refrigerx
 * Transportation LLC (the canonical row `684f5776…`, the one 11 existing USMCA loads already use —
 * resolved by usage, never guessed), Laredo TX → Quakertown PA, pickup 2026-09-08. The other 5
 * open-board loads are HELD OUT of this script on purpose:
 *   - 13582/13583/13587/13589 — their trucks (T177/T152/T156/T176) are still ACTIVE on a prior load
 *     here (13574/13575/13578/13580) that has delivered in AllwaysTrack. Advancing those prior loads
 *     fires revenue-recognition on loads that are in Claude's settlement-rebuild reverse scope
 *     (S-2026-0018/0021), so that advance is sequenced WITH the rebuild, not raced ahead of it.
 *   - 13586 — needs driver Leonel Antonio Morales CREATED (no real phone on file) and customer
 *     "Mode Transportation" has duplicate rows with no canonical usage; both are owner-decided values
 *     bundled into the rebuild work order, never guessed into prod here.
 *   - 13584 — is on signed tour 5800; owned by the rebuild.
 *
 * NO DIRECT SQL FOR WRITES — same established pattern as scripts/seed-missing-usmca-loads.ts:
 * bookLoad() (the one path every caller goes through), is_sample_data never true.
 *
 * Usage:
 *   DATABASE_URL=<neon> npx tsx scripts/ops/cursor-2026-09-10-seed-13588.mts --dry-run
 *   DATABASE_URL=<neon> npx tsx scripts/ops/cursor-2026-09-10-seed-13588.mts --apply
 */
import pg from "pg";
import { bookLoad, type BookLoadInput } from "../../apps/backend/src/dispatch/book-load.service.js";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";

// All three resolved live on br-fancy-credit-akjnd07a (bypass_rls=lucia, 2026-09-10):
const LOAD_NUMBER = "13588";
const DRIVER_ID = "4ff53886-41cc-434f-ae23-a36a0e3ec8e2"; // LUIS ARMANDO SOSA PEREZ (Active)
const UNIT_ID = "f4430f58-c259-43d8-83b5-f4004ab866be"; // T170 (free — no active load)
const CUSTOMER_ID = "684f5776-403b-422d-bc5e-2b44ae3b6a2c"; // Refrigerx Transportation LLC (canonical, 11 loads)

async function main() {
  const apply = process.argv.includes("--apply");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.bypass_rls','lucia',true)`);
    await client.query(`SELECT set_config('app.operating_company_id',$1::text,true)`, [USMCA_COMPANY_ID]);

    const existing = await client.query<{ id: string; status: string }>(
      `SELECT id::text, status::text FROM mdata.loads WHERE operating_company_id=$1::uuid AND load_number=$2 LIMIT 1`,
      [USMCA_COMPANY_ID, LOAD_NUMBER]
    );
    if (existing.rows[0]) {
      console.log(`SKIP ${LOAD_NUMBER} — already exists (id ${existing.rows[0].id}, status ${existing.rows[0].status}); never re-booking.`);
      await client.query("ROLLBACK");
      return;
    }
    await client.query("ROLLBACK");
  } finally {
    client.release();
  }

  const bookInput: BookLoadInput = {
    requestingUserUuid: OWNER_USER_ID,
    requestingUserRole: "Owner",
    operating_company_id: USMCA_COMPANY_ID,
    customer_id: CUSTOMER_ID,
    status: "dispatched",
    trip_type: "NB", // Laredo TX border pickup = northbound; starts a fresh tour for this driver.
    load_number: LOAD_NUMBER,
    requested_load_number: LOAD_NUMBER,
    is_sample_data: false,
    // Owner: seed at $0, edit amounts later. One zero linehaul so the load is a real revenue row at $0.
    charges: [{ code: "linehaul", amount_cents: 0 }],
    stops: [
      { stop_type: "pickup", sequence_number: 1, city: "Laredo", state: "TX", scheduled_arrival_at: "2026-09-08T08:00:00.000Z", time_window_type: "appointment" },
      { stop_type: "delivery", sequence_number: 2, city: "Quakertown", state: "PA", scheduled_arrival_at: "2026-09-11T08:00:00.000Z", time_window_type: "appointment" },
    ],
    save_mode: "book_dispatch",
    assigned_primary_driver_id: DRIVER_ID,
    assigned_unit_id: UNIT_ID,
    trailer_type: "refrigerated_van", // AllwaysTrack: 10224 53' Reefer
    mileage_source: "History",
    override_reason: `Thursday AllwaysTrack catch-up: open-board load ${LOAD_NUMBER} seeded at $0 (owner order 2026-09-10, THURSDAY-CATCHUP §C), amounts entered later`,
    override_rules: [
      { rule_code: "WF-HOS-VIOLATION", reason: `Thursday catch-up seed: load ${LOAD_NUMBER}` },
      { rule_code: "WF-MED-CARD-MISSING", reason: `Thursday catch-up seed: load ${LOAD_NUMBER}`, subject: "Luis Armando Sosa Perez" },
    ],
    override_token: `thursday-catchup-open-load-${LOAD_NUMBER}`,
  } as BookLoadInput;

  if (!apply) {
    console.log(`DRY-RUN ${LOAD_NUMBER}: would bookLoad NB, driver ${DRIVER_ID} / unit ${UNIT_ID} (T170) / customer ${CUSTOMER_ID} (Refrigerx), Laredo TX → Quakertown PA, $0 linehaul, is_sample_data=false. No write.`);
    await pool.end();
    return;
  }

  const result = await bookLoad(bookInput);
  if (result.kind === "error") {
    console.error(`FAIL ${LOAD_NUMBER} — bookLoad refused: ${JSON.stringify(result.payload)}`);
    await pool.end();
    process.exit(1);
  }
  console.log(`DONE ${LOAD_NUMBER} — booked id ${String(result.row.id)}, status ${String(result.row.status ?? "?")}, presettlement=${JSON.stringify(result.row.presettlement_link ?? result.row.presettlement_link_id ?? null)}`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
