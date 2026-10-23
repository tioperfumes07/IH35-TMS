/**
 * LEAD 443.251 (owner, 2026-10-22: "in dispatch, in kanban, the units are still not dragable from one box to the
 * next") — real Postgres, one case per write a truck drop can make:
 *  1b. truck → "Assigned" lane opens Book with book_without_dispatch: a crewed booking lands at
 *      assigned_not_dispatched (fail-old: on main book_dispatch + crew ALWAYS wrote 'dispatched', so the lane the
 *      truck was dropped on was ignored). Without the flag it still lands at 'dispatched' (unchanged).
 *  1c. truck ⇄ Fleet out of service goes through the audited maintenance writer: mark → is_oos + audit
 *      'maintenance.unit.marked_oos'; return → is_oos false + audit 'maintenance.unit.returned_to_service'; a second
 *      mark on an OOS truck is refused with its reason (the toast the board shows).
 * 1a/2 (truck ⇄ load card = assign) reuse patchAssignUnit → the existing assign engine, covered by its own tests.
 * Fixture shape copied from book-load-on-client.db.test.ts.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites, prepareCompanyForLoadInserts } from "../../../test-helpers/db-fixture.js";
import { TEST_OWNER_USER_ID } from "../../../test-helpers/constants.js";
const extras = vi.hoisted(() => ({ geofences: vi.fn(async () => undefined), geocode: vi.fn(async () => undefined), refMiles: vi.fn(async () => undefined) }));
vi.mock("../../telematics/auto-geofence.service.js", () => ({ autoCreateGeofencesForLoad: extras.geofences }));
vi.mock("../../telematics/stops-geocode-backfill.service.js", () => ({ geocodeStopsBackfill: extras.geocode }));
vi.mock("../google-reference-miles.service.js", async (orig) => ({ ...(await orig<Record<string, unknown>>()), computeAndPersistGoogleReferenceMilesForLoad: extras.refMiles }));
const deadhead = vi.hoisted(() => ({ fill: vi.fn(async (_c: unknown, a: { loadId: string }) => ({ load_id: a.loadId, load_number: null, status: "not_filled", miles: null, method: null, reason: "test stub" })) }));
vi.mock("../mileage/miles-recommendations.service.js", async (orig) => ({ ...(await orig<Record<string, unknown>>()), fillLoadDeadhead: deadhead.fill }));
import { bookLoadOnClient, type BookLoadInput } from "../book-load.service.js";
import { manualMarkUnitOos, manualReturnUnitToService } from "../../maintenance/severe-repair-estimate.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("Kanban truck drops write through the existing engines (LEAD 443.251)", () => {
  let db: pg.Client;
  let companyId: string;
  let customerId: string;
  let driverId: string;
  let unitId: string;
  const suf = randomUUID().slice(0, 8);

  beforeAll(async () => {
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL required");
    companyId = await ensureIntegrationPrerequisites();
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await db.query("SET ROLE ih35_app");
    await db.query(`SELECT set_config('app.bypass_rls', 'lucia', false)`);
    await db.query(`SELECT set_config('app.operating_company_id', $1::text, false)`, [companyId]);
    await db.query(`SELECT set_config('app.current_user_id', $1::text, false)`, [TEST_OWNER_USER_ID]);
    await db.query("BEGIN");
    await prepareCompanyForLoadInserts(db, companyId);
    customerId = (await db.query<{ id: string }>(
      `INSERT INTO mdata.customers (customer_name, operating_company_id) VALUES ($1, $2::uuid) RETURNING id`,
      [`443.251 customer ${suf}`, companyId],
    )).rows[0]!.id;
    driverId = (await db.query<{ id: string }>(
      `INSERT INTO mdata.drivers (first_name, last_name, phone, email, operating_company_id, status, cdl_expires_at, dot_medical_expires_at)
       VALUES ($1, $2, $3, $4, $5::uuid, 'Active', '2099-12-31', '2099-12-31') RETURNING id`,
      ["Round443251", `Driver-${suf}`, `+15552251${suf.slice(0, 4)}`, `r443-251-${suf}@test.invalid`, companyId],
    )).rows[0]!.id;
    unitId = (await db.query<{ id: string }>(
      `INSERT INTO mdata.units (unit_number, vin, owner_company_id, is_sample_data) VALUES ($1, $2, $3::uuid, true) RETURNING id::text AS id`,
      [`T${String(800000 + Math.floor(Math.random() * 99999))}`, `K251${suf}VIN0000000`.slice(0, 17), companyId],
    )).rows[0]!.id;
    await db.query("COMMIT");
  }, 30_000);

  afterAll(async () => {
    await db?.end();
  });

  function input(overrides: Partial<BookLoadInput> = {}): BookLoadInput {
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
    const dayAfter = new Date(Date.now() + 2 * 86_400_000).toISOString();
    return {
      requestingUserUuid: TEST_OWNER_USER_ID,
      requestingUserRole: "Owner",
      operating_company_id: companyId,
      customer_id: customerId,
      status: "assigned_not_dispatched",
      assigned_primary_driver_id: driverId,
      miles_practical: 950,
      charges: [{ code: "linehaul", amount_cents: 150_000 }],
      customer_po_number: "PO-443-251",
      requested_load_number: String(700000 + Math.floor(Math.random() * 200000)),
      trip_type: "NB",
      stops: [
        { stop_type: "pickup", sequence_number: 1, city: "Laredo", state: "TX", scheduled_arrival_at: tomorrow },
        { stop_type: "delivery", sequence_number: 2, city: "Dallas", state: "TX", scheduled_arrival_at: dayAfter },
      ],
      save_mode: "book_dispatch",
      trailer_choice: { kind: "none" },
      ...overrides,
    };
  }

  async function bookedStatus(overrides: Partial<BookLoadInput>): Promise<string> {
    await db.query("BEGIN");
    try {
      const booked = await bookLoadOnClient(db, input(overrides));
      expect(booked.result.kind, JSON.stringify(booked.result)).toBe("ok");
      if (booked.result.kind !== "ok") return "";
      const row = await db.query<{ status: string }>(`SELECT status::text AS status FROM mdata.loads WHERE id = $1::uuid`, [String(booked.result.row.id)]);
      return row.rows[0]!.status;
    } finally {
      await db.query("ROLLBACK");
    }
  }

  it("1b: truck → Assigned lane books at assigned_not_dispatched; the default Book still dispatches", async () => {
    expect(await bookedStatus({ book_without_dispatch: true })).toBe("assigned_not_dispatched");
    expect(await bookedStatus({})).toBe("dispatched");
  }, 60_000);

  it("1c: truck → Fleet out of service and back, through the audited writer; a repeat mark is refused with its reason", async () => {
    const audits = async (eventClass: string) =>
      (await db.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM audit.audit_events WHERE event_class = $1 AND payload->>'resource_id' = $2`,
        [eventClass, unitId],
      )).rows[0]!.n;
    const isOos = async () => (await db.query<{ is_oos: boolean }>(`SELECT is_oos FROM mdata.units WHERE id = $1::uuid`, [unitId])).rows[0]!.is_oos;

    await manualMarkUnitOos(TEST_OWNER_USER_ID, { operating_company_id: companyId, unit_id: unitId, reason: "Kanban drop: brake chamber" });
    expect(await isOos()).toBe(true);
    expect(await audits("maintenance.unit.marked_oos")).toBe(1);

    await expect(
      manualMarkUnitOos(TEST_OWNER_USER_ID, { operating_company_id: companyId, unit_id: unitId, reason: "second drop" }),
    ).rejects.toThrow(/E_NOT_FOUND_OR_ALREADY_OOS/);

    await manualReturnUnitToService(TEST_OWNER_USER_ID, { operating_company_id: companyId, unit_id: unitId, review_notes: "Kanban drop back: repaired" });
    expect(await isOos()).toBe(false);
    expect(await audits("maintenance.unit.returned_to_service")).toBe(1);
  }, 60_000);
});
