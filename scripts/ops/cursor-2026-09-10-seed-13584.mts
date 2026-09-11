#!/usr/bin/env tsx
/**
 * scripts/ops/cursor-2026-09-10-seed-13584.mts — last Thursday catch-up load (owner: seed 13584).
 *
 * Tour 5800 (signed): Vicente Santos Contreras, loads 13551 + 13573 + 13584. 13551/13573 already
 * exist (closed, Armstrong, T174). 13584's route is the geographic close of that tour: 13573
 * delivered Ft Worth TX 2026-09-04; signed lines say 13584 loaded 421.0 mi — Ft Worth → Laredo
 * is that distance. Enlonada/desenlonada on the signed lines = flatbed. Rate $0 (owner: edit later).
 *
 * T174 is currently ACTIVE on open-board 13586 (Leonel). uq_loads_one_active_unit forbids a second
 * dispatched load on T174. So: book 13584 WITHOUT a unit → stamp delivery → transition to
 * delivered_pending_docs (outside the active set) → THEN attach T174 + Vicente. Never steal 13586's truck.
 *
 * Usage:
 *   DATABASE_URL=<neon> npx tsx scripts/ops/cursor-2026-09-10-seed-13584.mts --dry-run
 *   DATABASE_URL=<neon> npx tsx scripts/ops/cursor-2026-09-10-seed-13584.mts --apply
 */
import pg from "pg";
import { bookLoad, type BookLoadInput } from "../../apps/backend/src/dispatch/book-load.service.js";
import { createIntegrationApp } from "../../apps/backend/test-helpers/http-app.js";
import { registerLoadRoutes } from "../../apps/backend/src/mdata/loads.routes.js";
import { registerDispatchLoadRoutes } from "../../apps/backend/src/dispatch/loads.routes.js";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const LOAD_NUMBER = "13584";
const DRIVER_ID = "40022039-b657-4713-97de-439fba899946";
const UNIT_ID = "8a842d23-8261-4c5a-bf72-bb38fa93b9f5";
const CUSTOMER_ID = "99a7814d-e2e7-4616-b255-bf91d9e450df";
const PU_AT = "2026-09-05T08:00:00.000Z";
const DEL_AT = "2026-09-06T09:00:00.000Z";

async function main() {
  const apply = process.argv.includes("--apply");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
  process.env.IH35_TEST_AUTH_BYPASS = "1";
  const app = await createIntegrationApp(async (a) => {
    await registerLoadRoutes(a);
    await registerDispatchLoadRoutes(a);
  });
  const headers = {
    "x-test-auth": Buffer.from(
      JSON.stringify({ id: OWNER_USER_ID, role: "Owner", email: "tioperfumes07@gmail.com" }),
      "utf8"
    ).toString("base64url"),
  };

  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query(`SELECT set_config('app.bypass_rls','lucia',true)`);
    const existing = await c.query<{ id: string; status: string }>(
      `SELECT id::text, status::text FROM mdata.loads WHERE operating_company_id=$1::uuid AND load_number=$2`,
      [USMCA_COMPANY_ID, LOAD_NUMBER]
    );
    await c.query("ROLLBACK");
    if (existing.rows[0]) {
      console.log(`13584 SKIP — exists ${existing.rows[0].id} status ${existing.rows[0].status}`);
      return;
    }
  } finally {
    c.release();
  }

  if (!apply) {
    console.log(
      "13584 DRY-RUN would bookLoad SB $0 Armstrong, Ft Worth TX → Laredo TX, no unit (T174 held by 13586), then deliver + attach T174/Vicente"
    );
    await app.close();
    await pool.end();
    return;
  }

  const result = await bookLoad({
    requestingUserUuid: OWNER_USER_ID,
    requestingUserRole: "Owner",
    operating_company_id: USMCA_COMPANY_ID,
    customer_id: CUSTOMER_ID,
    status: "dispatched",
    trip_type: "SB",
    load_number: LOAD_NUMBER,
    requested_load_number: LOAD_NUMBER,
    is_sample_data: false,
    charges: [{ code: "linehaul", amount_cents: 0 }],
    stops: [
      { stop_type: "pickup", sequence_number: 1, city: "Fort Worth", state: "TX", scheduled_arrival_at: PU_AT, time_window_type: "appointment" },
      { stop_type: "delivery", sequence_number: 2, city: "Laredo", state: "TX", scheduled_arrival_at: DEL_AT, time_window_type: "appointment" },
    ],
    save_mode: "book_dispatch",
    assigned_primary_driver_id: DRIVER_ID,
    trailer_type: "flatbed",
    mileage_source: "History",
    override_reason: "Thursday catch-up: signed tour 5800 load 13584 seeded at $0 (owner 2026-09-10). Unit attached after delivery so T174 stays on 13586.",
    override_rules: [
      { rule_code: "WF-HOS-VIOLATION", reason: "Thursday catch-up seed: load 13584" },
      { rule_code: "WF-MED-CARD-MISSING", reason: "Thursday catch-up seed: load 13584", subject: "Vicente Santos Contreras" },
    ],
    override_token: "thursday-catchup-open-load-13584",
  } as BookLoadInput);

  if (result.kind === "error") {
    console.log(`13584 FAIL bookLoad ${JSON.stringify(result.payload)}`);
    await app.close();
    await pool.end();
    process.exit(1);
  }

  const loadId = String(result.row.id);
  const stops = await (async () => {
    const cx = await pool.connect();
    try {
      await cx.query("BEGIN");
      await cx.query(`SELECT set_config('app.bypass_rls','lucia',true)`);
      const r = await cx.query<{ sid: string; stop_type: string }>(
        `SELECT id::text AS sid, stop_type::text FROM mdata.load_stops WHERE load_id=$1::uuid AND soft_deleted_at IS NULL ORDER BY sequence_number`,
        [loadId]
      );
      await cx.query("ROLLBACK");
      return r.rows;
    } finally {
      cx.release();
    }
  })();

  const pickup = stops.find((s) => s.stop_type === "pickup");
  const delivery = stops.find((s) => s.stop_type === "delivery");
  if (pickup) {
    await app.inject({
      method: "PATCH",
      url: `/api/v1/mdata/loads/${loadId}/stops/${pickup.sid}`,
      headers,
      payload: { actual_arrival_at: "2026-09-05T08:00:00.000Z", actual_departure_at: "2026-09-05T09:00:00.000Z" },
    });
  }
  if (delivery) {
    await app.inject({
      method: "PATCH",
      url: `/api/v1/mdata/loads/${loadId}/stops/${delivery.sid}`,
      headers,
      payload: { actual_arrival_at: "2026-09-06T08:00:00.000Z", actual_departure_at: DEL_AT },
    });
  }

  const t1 = await app.inject({
    method: "PATCH",
    url: `/api/v1/dispatch/loads/${loadId}/transition?operating_company_id=${USMCA_COMPANY_ID}`,
    headers,
    payload: { new_status: "in_transit" },
  });
  const t2 = await app.inject({
    method: "PATCH",
    url: `/api/v1/dispatch/loads/${loadId}/transition?operating_company_id=${USMCA_COMPANY_ID}`,
    headers,
    payload: { new_status: "delivered_pending_docs", delivered_at: DEL_AT },
  });

  const assign = await app.inject({
    method: "PATCH",
    url: `/api/v1/mdata/loads/${loadId}?operating_company_id=${USMCA_COMPANY_ID}`,
    headers,
    payload: { assigned_unit_id: UNIT_ID, assigned_primary_driver_id: DRIVER_ID },
  });

  console.log(
    `13584 SEEDED ${loadId} book=${String(result.row.status)} in_transit=${t1.statusCode} delivered=${t2.statusCode} assignT174=${assign.statusCode} ${assign.statusCode >= 300 ? assign.body.slice(0, 240) : ""}`
  );

  await app.close();
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
