#!/usr/bin/env tsx
/**
 * scripts/ops/cursor-2026-09-10-thursday-open-loads.mts — Thursday AllwaysTrack catch-up, full
 * remainder (owner order 2026-09-10, THURSDAY-CATCHUP-2026-09-10.md §C / §C-EXEC). 13588 already
 * seeded live (PR #21722). This finishes the rest, in the ONE correct order:
 *
 *   PHASE 0 — create driver Leonel Antonio Morales (owner: "create"). Status Probation (active-entity
 *             law: a seed/import NEVER creates a driver Active). No real phone on file → a clearly
 *             flagged placeholder E.164; owner enters the real number in-app. Idempotent.
 *   PHASE 1 — advance the 4 delivered prior loads (13574/13575/13578/13580) that are still 'dispatched'
 *             but have delivered in AllwaysTrack, freeing their trucks (T177/T152/T156/T176). Uses the
 *             REAL office/dispatch transition + stop-evidence routes (never raw SQL), mirroring
 *             scripts/ops/deliver-seeded-usmca-loads.ts: stamp delivery (and, for 13580, pickup)
 *             evidence from the AllwaysTrack date, then dispatched → in_transit → delivered_pending_docs.
 *             This posts CUSTOMER revenue-rec (invoice + A/R) — a different subledger from Claude's
 *             DRIVER-settlement rebuild, so it does not collide.
 *   PHASE 2 — seed the 5 remaining open-board loads (13582/13583/13586/13587/13589) at rate $0 via
 *             bookLoad, trucks now free (uq_loads_one_active_unit accepts). is_sample_data=false.
 *
 * 13584 is NOT here — it is on signed tour 5800 and its per-load detail (unit/route) is not on the open
 * board; the rebuild extracts it from the signed PDF (owner: pull from AllwaysTrack — the PDF is that).
 *
 * trip_type is set NB for all 5 seeds as a PROVISIONAL label: NB reliably links a pre-settlement via the
 * real linker (proven on 13588 → S-2026-0013) and never orphans; at $0 the tour DIRECTION is immaterial
 * and the owner/rebuild refines it. It is never a money value here.
 *
 * All customer/driver ids resolved live on br-fancy-credit-akjnd07a (bypass_rls=lucia, 2026-09-10):
 * canonical-by-usage where one exists (Semares 04b65d8b=10 loads, Hawkeye ba40f2bf, Genaro 6edcb351=7
 * loads), most-recently-created where no load uses the name yet (Mode/Key Global/Kirsch — owner ruling
 * "you resolve"), dups flagged in §C-EXEC for a later dedup pass.
 *
 * Usage:
 *   DATABASE_URL=<neon> npx tsx scripts/ops/cursor-2026-09-10-thursday-open-loads.mts --dry-run
 *   DATABASE_URL=<neon> npx tsx scripts/ops/cursor-2026-09-10-thursday-open-loads.mts --apply
 */
import pg from "pg";
import { bookLoad, type BookLoadInput } from "../../apps/backend/src/dispatch/book-load.service.js";
import { createIntegrationApp } from "../../apps/backend/test-helpers/http-app.js";
import { registerLoadRoutes } from "../../apps/backend/src/mdata/loads.routes.js";
import { registerDispatchLoadRoutes } from "../../apps/backend/src/dispatch/loads.routes.js";
import { registerDriverRoutes } from "../../apps/backend/src/mdata/drivers.routes.js";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";

type Inject = { inject: (o: { method: string; url: string; headers: Record<string, string>; payload?: unknown }) => Promise<{ statusCode: number; body: string }> };

const PRIOR: Array<{ ln: string; deliveryDate: string; pickupDate?: string; stampPickup: boolean }> = [
  { ln: "13574", deliveryDate: "2026-09-08", stampPickup: false },
  { ln: "13575", deliveryDate: "2026-09-08", stampPickup: false },
  { ln: "13578", deliveryDate: "2026-09-06", stampPickup: false },
  { ln: "13580", deliveryDate: "2026-09-08", pickupDate: "2026-09-04", stampPickup: true },
];

type Seed = {
  ln: string; driverId: string | null; driverName: string; unitId: string; customerId: string; customerName: string;
  trailerType: BookLoadInput["trailer_type"]; puCity: string; puState: string; puAt: string; delCity: string; delState: string; delAt: string;
};
const LEONEL = { first: "Leonel Antonio", last: "Morales", phone: "+10000013586" };
const SEEDS: Seed[] = [
  { ln: "13582", driverId: "3e138476-06db-4b08-9ebe-527a5d8c591d", driverName: "Jorge Luis Infante Corona", unitId: "e15c43f8-3c61-4d1c-be67-05a489c3e622", customerId: "04b65d8b-a1a3-4580-9224-d0f16b0946f5", customerName: "Semares Forwarding Services", trailerType: "flatbed", puCity: "Laredo", puState: "TX", puAt: "2026-09-08T12:00:00.000Z", delCity: "Edison", delState: "NJ", delAt: "2026-09-11T09:00:00.000Z" },
  { ln: "13583", driverId: "6edcb351-e81b-4bf2-adf7-5eca9eff9137", driverName: "Genaro Guerrero Chavez", unitId: "19d29860-9753-4376-93c4-dc963cc86483", customerId: "ba40f2bf-6033-41fc-8078-841c34c15029", customerName: "Hawkeye Transportation Services", trailerType: "refrigerated_van", puCity: "Laredo", puState: "TX", puAt: "2026-09-08T07:00:00.000Z", delCity: "Stoughton", delState: "MA", delAt: "2026-09-12T06:00:00.000Z" },
  { ln: "13586", driverId: null, driverName: "Leonel Antonio Morales", unitId: "8a842d23-8261-4c5a-bf72-bb38fa93b9f5", customerId: "fea869bd-ec0a-4ef6-bdf6-9578d2061adb", customerName: "Mode Transportation", trailerType: "flatbed", puCity: "Austinville", puState: "VA", puAt: "2026-09-08T08:00:00.000Z", delCity: "San Antonio", delState: "TX", delAt: "2026-09-10T08:00:00.000Z" },
  { ln: "13587", driverId: "fba21d80-628b-4228-ae54-336f9cbb73b6", driverName: "Angel Alfonso Sosa Perez", unitId: "a10cd288-f599-4016-a8b4-6d70e33f3925", customerId: "237d0488-f3ed-430f-9f4c-e8aa7f071e6c", customerName: "Key Global Logistics", trailerType: "refrigerated_van", puCity: "Delphi", puState: "IN", puAt: "2026-09-10T08:00:00.000Z", delCity: "Laredo", delState: "TX", delAt: "2026-09-14T07:00:00.000Z" },
  { ln: "13589", driverId: "a32a35c8-7cd5-4368-83f0-35e185092433", driverName: "Neftali Coronado Urbano", unitId: "f439def3-05ac-42cf-829b-2b66ecf85a32", customerId: "7aa307a0-69cb-45de-a949-4fa74fe4b3d0", customerName: "Kirsch Transportation Services INC", trailerType: "flatbed", puCity: "Clarks Summit", puState: "PA", puAt: "2026-09-09T08:00:00.000Z", delCity: "Houston", delState: "TX", delAt: "2026-09-14T07:00:00.000Z" },
];

async function main() {
  const apply = process.argv.includes("--apply");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
  process.env.IH35_TEST_AUTH_BYPASS = "1";
  const app = await createIntegrationApp(async (a) => {
    await registerLoadRoutes(a);
    await registerDispatchLoadRoutes(a);
    await registerDriverRoutes(a);
  });
  const headers = { "x-test-auth": Buffer.from(JSON.stringify({ id: OWNER_USER_ID, role: "Owner", email: "tioperfumes07@gmail.com" }), "utf8").toString("base64url") };
  const report: string[] = [];

  // helper — scoped read
  async function read<T = Record<string, unknown>>(sql: string, params: unknown[]): Promise<T[]> {
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      await c.query(`SELECT set_config('app.bypass_rls','lucia',true)`);
      const r = await c.query<T>(sql, params);
      await c.query("ROLLBACK");
      return r.rows;
    } finally { c.release(); }
  }

  // ── PHASE 0 — ensure Leonel ───────────────────────────────────────────────
  let leonelId: string | null = null;
  const existingLeonel = await read<{ id: string }>(
    `SELECT id::text FROM mdata.drivers WHERE operating_company_id=$1::uuid AND lower(first_name||' '||last_name)=lower($2)`,
    [USMCA_COMPANY_ID, `${LEONEL.first} ${LEONEL.last}`]
  );
  if (existingLeonel[0]) {
    leonelId = existingLeonel[0].id;
    report.push(`PHASE0 | Leonel EXISTS ${leonelId}`);
  } else if (!apply) {
    report.push(`PHASE0 | DRY-RUN would create driver "${LEONEL.first} ${LEONEL.last}" status Probation, placeholder phone ${LEONEL.phone} (owner enters real number)`);
  } else {
    const res = await app.inject({ method: "POST", url: `/api/v1/mdata/drivers?operating_company_id=${USMCA_COMPANY_ID}`, headers, payload: { operating_company_id: USMCA_COMPANY_ID, first_name: LEONEL.first, last_name: LEONEL.last, phone: LEONEL.phone, status: "Probation" } });
    if (res.statusCode >= 300) { report.push(`PHASE0 | Leonel CREATE FAILED ${res.statusCode} ${res.body}`); }
    else { leonelId = (JSON.parse(res.body) as { id: string }).id; report.push(`PHASE0 | Leonel CREATED ${leonelId} (Probation, placeholder phone ${LEONEL.phone})`); }
  }

  // ── PHASE 1 — advance delivered prior loads ───────────────────────────────
  for (const p of PRIOR) {
    const rows = await read<{ id: string; status: string; sid: string; stop_type: string; a_arr: string | null; a_dep: string | null }>(
      `SELECT l.id::text, l.status::text, st.id::text AS sid, st.stop_type::text, st.actual_arrival_at::text AS a_arr, st.actual_departure_at::text AS a_dep
         FROM mdata.loads l JOIN mdata.load_stops st ON st.load_id=l.id AND st.soft_deleted_at IS NULL
        WHERE l.operating_company_id=$1::uuid AND l.load_number=$2 ORDER BY st.sequence_number`,
      [USMCA_COMPANY_ID, p.ln]
    );
    if (!rows[0]) { report.push(`PHASE1 | ${p.ln} NOT FOUND`); continue; }
    if (rows[0].status !== "dispatched") { report.push(`PHASE1 | ${p.ln} SKIP — status is ${rows[0].status}, not dispatched`); continue; }
    const pickup = rows.find((r) => r.stop_type === "pickup");
    const delivery = rows.find((r) => r.stop_type === "delivery");
    const delivered_at = new Date(`${p.deliveryDate}T09:00:00.000Z`).toISOString();
    if (!apply) {
      report.push(`PHASE1 | ${p.ln} DRY-RUN would stamp ${p.stampPickup ? "pickup+" : ""}delivery evidence (${p.deliveryDate}) then transition dispatched→in_transit→delivered_pending_docs (delivered_at ${delivered_at})`);
      continue;
    }
    // stamp evidence (real stops route)
    if (p.stampPickup && pickup) {
      await app.inject({ method: "PATCH", url: `/api/v1/mdata/loads/${rows[0].id}/stops/${pickup.sid}`, headers, payload: { actual_arrival_at: new Date(`${p.pickupDate}T08:00:00.000Z`).toISOString(), actual_departure_at: new Date(`${p.pickupDate}T09:00:00.000Z`).toISOString() } });
    }
    if (delivery) {
      await app.inject({ method: "PATCH", url: `/api/v1/mdata/loads/${rows[0].id}/stops/${delivery.sid}`, headers, payload: { actual_arrival_at: new Date(`${p.deliveryDate}T08:00:00.000Z`).toISOString(), actual_departure_at: delivered_at } });
    }
    const results: string[] = [];
    for (const target of ["in_transit", "delivered_pending_docs"] as const) {
      const res = await app.inject({ method: "PATCH", url: `/api/v1/dispatch/loads/${rows[0].id}/transition?operating_company_id=${USMCA_COMPANY_ID}`, headers, payload: target === "delivered_pending_docs" ? { new_status: target, delivered_at } : { new_status: target } });
      results.push(`${target}=${res.statusCode}`);
      if (res.statusCode >= 300) { results.push(res.body.slice(0, 180)); break; }
    }
    report.push(`PHASE1 | ${p.ln} ${results.some((s) => /=[45]\d\d/.test(s)) ? "FAIL" : "ADVANCED"} · ${results.join(" · ")}`);
  }

  // ── PHASE 2 — seed remaining open loads ───────────────────────────────────
  for (const s of SEEDS) {
    const driverId = s.driverId ?? leonelId;
    if (!driverId) { report.push(`PHASE2 | ${s.ln} BLOCKED — no driver id (Leonel not created)`); continue; }
    const existing = await read<{ id: string; status: string }>(`SELECT id::text, status::text FROM mdata.loads WHERE operating_company_id=$1::uuid AND load_number=$2`, [USMCA_COMPANY_ID, s.ln]);
    if (existing[0]) { report.push(`PHASE2 | ${s.ln} SKIP — exists (${existing[0].id}, ${existing[0].status})`); continue; }
    if (!apply) { report.push(`PHASE2 | ${s.ln} DRY-RUN would bookLoad NB $0, driver ${driverId} / unit ${s.unitId} / customer ${s.customerId} (${s.customerName}), ${s.puCity} ${s.puState} → ${s.delCity} ${s.delState}, trailer ${s.trailerType}`); continue; }
    const bookInput = {
      requestingUserUuid: OWNER_USER_ID, requestingUserRole: "Owner", operating_company_id: USMCA_COMPANY_ID,
      customer_id: s.customerId, status: "dispatched", trip_type: "NB", load_number: s.ln, requested_load_number: s.ln,
      is_sample_data: false, charges: [{ code: "linehaul", amount_cents: 0 }],
      stops: [
        { stop_type: "pickup", sequence_number: 1, city: s.puCity, state: s.puState, scheduled_arrival_at: s.puAt, time_window_type: "appointment" },
        { stop_type: "delivery", sequence_number: 2, city: s.delCity, state: s.delState, scheduled_arrival_at: s.delAt, time_window_type: "appointment" },
      ],
      save_mode: "book_dispatch", assigned_primary_driver_id: driverId, assigned_unit_id: s.unitId, trailer_type: s.trailerType, mileage_source: "History",
      override_reason: `Thursday AllwaysTrack catch-up: open-board load ${s.ln} seeded at $0 (owner order 2026-09-10, THURSDAY-CATCHUP §C), amounts entered later`,
      override_rules: [ { rule_code: "WF-HOS-VIOLATION", reason: `Thursday catch-up seed: load ${s.ln}` }, { rule_code: "WF-MED-CARD-MISSING", reason: `Thursday catch-up seed: load ${s.ln}`, subject: s.driverName } ],
      override_token: `thursday-catchup-open-load-${s.ln}`,
    } as BookLoadInput;
    const result = await bookLoad(bookInput);
    if (result.kind === "error") { report.push(`PHASE2 | ${s.ln} FAIL — ${JSON.stringify(result.payload)}`); continue; }
    report.push(`PHASE2 | ${s.ln} SEEDED — id ${String(result.row.id)} status ${String(result.row.status ?? "?")}`);
  }

  await app.close();
  await pool.end();
  console.log(report.join("\n"));
}

main().catch((e) => { console.error(e); process.exit(1); });
