/**
 * LEAD 443.107 item 3 (owner, 2026-10-12): Book Load REQUIRES the trailer choice and records it on the load.
 * Proven on a real Postgres round-trip (CI ephemeral DB), every case inside a transaction rolled back by the test:
 *  - no choice                 -> 422 trailer_choice_required, nothing written
 *  - company trailer           -> dispatch.load_assignment_history.new_trailer_id + trailer_source 'company', and an
 *                                 expense on the load inherits trailer_id (accounting.expenses_trailer_from_load)
 *  - another company's trailer -> 422 trailer_not_in_company_fleet, nothing written (never silently dropped)
 *  - customer trailer number   -> dispatch.non_owned_trailers row + trailer_source 'customer', and the expense
 *                                 inherits non_owned_trailer_id (migration 202615790910)
 *  - no trailer                -> trailer_source 'none' (an explicit, recorded choice)
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
import { bookLoadOnClient, type BookLoadInput } from "../book-load.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("Book Load requires and records the trailer choice (LEAD 443.107)", () => {
  let db: pg.Client;
  let companyId: string;
  let otherCompanyId: string;
  let customerId: string;
  let ownTrailerId: string;
  let foreignTrailerId: string;
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
      [`443.107 customer ${suf}`, companyId],
    )).rows[0]!.id;
    otherCompanyId = (await db.query<{ id: string }>(
      `INSERT INTO org.companies (code, legal_name, company_type) VALUES ($1, $2, 'operating_carrier') RETURNING id::text AS id`,
      [`T107${suf.slice(0, 4)}`.toUpperCase(), `443.107 other ${suf}`],
    )).rows[0]!.id;
    const equipment = async (n: string, owner: string) =>
      (await db.query<{ id: string }>(
        `INSERT INTO mdata.equipment (equipment_number, equipment_type, owner_company_id) VALUES ($1, 'Reefer', $2::uuid) RETURNING id::text AS id`,
        [`T107-${suf}-${n}`, owner],
      )).rows[0]!.id;
    ownTrailerId = await equipment("OWN", companyId);
    foreignTrailerId = await equipment("FOREIGN", otherCompanyId);
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
      miles_practical: 950,
      charges: [{ code: "linehaul", amount_cents: 150_000 }],
      customer_po_number: "PO-443-107",
      requested_load_number: String(700000 + Math.floor(Math.random() * 200000)),
      stops: [
        { stop_type: "pickup", sequence_number: 1, city: "Laredo", state: "TX", scheduled_arrival_at: tomorrow },
        { stop_type: "delivery", sequence_number: 2, city: "Dallas", state: "TX", scheduled_arrival_at: dayAfter },
      ],
      save_mode: "book_dispatch",
      ...overrides,
    };
  }

  /** Book inside a transaction the test always rolls back; returns the result and what the load recorded. */
  async function bookAndRead(overrides: Partial<BookLoadInput>) {
    await db.query("BEGIN");
    try {
      const before = (await db.query(`SELECT count(*)::int AS n FROM mdata.loads WHERE operating_company_id = $1::uuid`, [companyId])).rows[0]!.n;
      const booked = await bookLoadOnClient(db, input(overrides));
      const after = (await db.query(`SELECT count(*)::int AS n FROM mdata.loads WHERE operating_company_id = $1::uuid`, [companyId])).rows[0]!.n;
      if (booked.result.kind !== "ok") return { result: booked.result, written: after - before, load: null, expense: null, history: null };
      const loadId = String(booked.result.row.id);
      const load = (await db.query(`SELECT trailer_source, non_owned_trailer_id::text FROM mdata.loads WHERE id = $1::uuid`, [loadId])).rows[0];
      const history = (await db.query(
        `SELECT new_trailer_id::text FROM dispatch.load_assignment_history WHERE load_id = $1::uuid AND new_trailer_id IS NOT NULL ORDER BY created_at DESC LIMIT 1`,
        [loadId],
      )).rows[0]?.new_trailer_id ?? null;
      // An expense on the load: the expense trailer trigger must carry the load's trailer (company or customer).
      await db.query(`UPDATE org.companies SET enforce_line_categorization = true WHERE id = $1::uuid`, [companyId]);
      const expense = (await db.query(
        `INSERT INTO accounting.expenses (operating_company_id, transaction_date, total_amount_cents, trace_no, load_id)
         VALUES ($1::uuid, CURRENT_DATE, 1000, $3, $2::uuid)
         RETURNING trailer_id::text, non_owned_trailer_id::text`,
        [companyId, loadId, 900_000_000 + Math.floor(Math.random() * 90_000_000)],
      ).catch((e: Error) => ({ rows: [{ error: e.message }] }))).rows[0];
      return { result: booked.result, written: after - before, load, expense, history };
    } finally {
      await db.query("ROLLBACK");
    }
  }

  it("refuses a booking with no trailer choice (422 trailer_choice_required) and writes nothing", async () => {
    const r = await bookAndRead({});
    expect(r.result).toMatchObject({ kind: "error", status: 422, payload: { error: "trailer_choice_required" } });
    expect(r.written).toBe(0);
  });

  it("refuses another company's trailer (422 trailer_not_in_company_fleet) — never silently drops it", async () => {
    const r = await bookAndRead({ trailer_choice: { kind: "company", equipment_id: foreignTrailerId } });
    expect(r.result).toMatchObject({ kind: "error", status: 422, payload: { error: "trailer_not_in_company_fleet" } });
    expect(r.written).toBe(0);
  });

  it("company trailer: recorded on the assignment history, trailer_source 'company', carried by the load's expense", async () => {
    const r = await bookAndRead({ trailer_choice: { kind: "company", equipment_id: ownTrailerId } });
    expect(r.result.kind, JSON.stringify(r.result)).toBe("ok");
    expect(r.history).toBe(ownTrailerId);
    expect(r.load).toMatchObject({ trailer_source: "company", non_owned_trailer_id: null });
    expect(r.expense, JSON.stringify(r.expense)).toMatchObject({ trailer_id: ownTrailerId });
  });

  it("customer trailer number: a non-owned trailer row, trailer_source 'customer', carried by the load's expense", async () => {
    const r = await bookAndRead({ trailer_choice: { kind: "customer", trailer_number: ` cust-${suf} ` } });
    expect(r.result.kind, JSON.stringify(r.result)).toBe("ok");
    expect(r.load?.trailer_source).toBe("customer");
    expect(r.load?.non_owned_trailer_id).toBeTruthy();
    expect(r.history).toBeNull();
    expect(r.expense, JSON.stringify(r.expense)).toMatchObject({ trailer_id: null, non_owned_trailer_id: r.load?.non_owned_trailer_id });
  });

  it("no trailer (bobtail / power only): trailer_source 'none', nothing on the expense", async () => {
    const r = await bookAndRead({ trailer_choice: { kind: "none" } });
    expect(r.result.kind, JSON.stringify(r.result)).toBe("ok");
    expect(r.load).toMatchObject({ trailer_source: "none", non_owned_trailer_id: null });
    expect(r.history).toBeNull();
    expect(r.expense, JSON.stringify(r.expense)).toMatchObject({ trailer_id: null, non_owned_trailer_id: null });
  });

  it("a draft is not refused without a trailer choice", async () => {
    const r = await bookAndRead({ save_mode: "draft" });
    expect(r.result.kind, JSON.stringify(r.result)).toBe("ok");
  });
});
