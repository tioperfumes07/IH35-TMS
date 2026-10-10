/**
 * ROUND 443.14 (Lead, 2026-10-10): bookLoadOnClient books on the CALLER's client with no
 * transaction of its own. Proven on a real Postgres round-trip (CI ephemeral DB): the caller rolls
 * back -> 0 loads remain; the three after-book extras did NOT run during the booking, and run only
 * when the caller invokes afterCommit. Fixture shape copied from book-load-zero-dollar-dispatch-gate.db.test.ts.
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

describeIntegration("bookLoadOnClient books inside the CALLER's transaction (ROUND 443.14)", () => {
  let db: pg.Client;
  let companyId: string;
  let customerId: string;
  let driverId: string;

  beforeAll(async () => {
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL required");
    companyId = await ensureIntegrationPrerequisites();
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await db.query("SET ROLE ih35_app");
    await db.query(`SELECT set_config('app.bypass_rls', 'lucia', false)`);
    await db.query(`SELECT set_config('app.operating_company_id', $1::text, false)`, [companyId]);
    await db.query("BEGIN");
    await prepareCompanyForLoadInserts(db, companyId);
    const suf = randomUUID().slice(0, 8);
    const cust = await db.query<{ id: string }>(
      `INSERT INTO mdata.customers (customer_name, operating_company_id) VALUES ($1, $2::uuid) RETURNING id`,
      [`443.14 customer ${suf}`, companyId]
    );
    customerId = cust.rows[0]!.id;
    // A fully-qualified driver (valid CDL + DOT medical, far in the future, no HOS snapshot row at
    // all -- views.drivers_with_hos_status LEFT JOINs samsara.hos_snapshots, so no row reads as
    // "not in violation", the same shape confirmed live against real USMCA drivers this round) --
    // this test is ONLY about the zero-dollar-charge-lines gate, so every OTHER gate must pass
    // cleanly to prove this one specifically fires (or doesn't) on its own.
    const drv = await db.query<{ id: string }>(
      `
        INSERT INTO mdata.drivers (
          first_name, last_name, phone, email, operating_company_id, status,
          cdl_expires_at, dot_medical_expires_at
        )
        VALUES ($1, $2, $3, $4, $5::uuid, 'Active', '2099-12-31', '2099-12-31')
        RETURNING id
      `,
      ["Round44314", `Driver-${suf}`, `+15550443${suf.slice(0, 4)}`, `r443-14-${suf}@test.invalid`, companyId]
    );
    driverId = drv.rows[0]!.id;
    await db.query("COMMIT");
  }, 30_000);

  afterAll(async () => {
    await db?.end();
  });

  function dispatchInput(overrides: Partial<BookLoadInput> = {}): BookLoadInput {
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
      customer_po_number: "PO-443-14",
      trip_type: "NB",
      stops: [
        { stop_type: "pickup", sequence_number: 1, city: "Laredo", state: "TX", scheduled_arrival_at: tomorrow },
        { stop_type: "delivery", sequence_number: 2, city: "Dallas", state: "TX", scheduled_arrival_at: dayAfter },
      ],
      save_mode: "book_dispatch", // + a crewed driver -> statusForInsert = 'dispatched'
      ...overrides,
    };
  }

  it("caller rolls back -> the load is gone (0 rows), and no after-book extra ran", async () => {
    extras.geofences.mockClear(); extras.geocode.mockClear(); extras.refMiles.mockClear();
    await db.query("BEGIN");
    let loadId = "";
    let afterCommit: () => void = () => {};
    try {
      const booked = await bookLoadOnClient(db, dispatchInput());
      expect(booked.result.kind, `expected ok, got: ${JSON.stringify(booked.result)}`).toBe("ok");
      if (booked.result.kind !== "ok") return;
      loadId = String(booked.result.row.id);
      afterCommit = booked.afterCommit;
      const inside = await db.query(`SELECT count(*)::int AS n FROM mdata.loads WHERE id = $1::uuid`, [loadId]);
      expect(inside.rows[0]?.n, "the load exists inside the caller's open transaction").toBe(1);
    } finally {
      await db.query("ROLLBACK");
    }
    const after = await db.query(`SELECT count(*)::int AS n FROM mdata.loads WHERE id = $1::uuid`, [loadId]);
    expect(after.rows[0]?.n, "caller rollback must leave 0 loads").toBe(0);
    const charges = await db.query(`SELECT count(*)::int AS n FROM dispatch.load_charge_lines WHERE load_id = $1::uuid`, [loadId]);
    expect(charges.rows[0]?.n).toBe(0);
    expect(extras.geofences).not.toHaveBeenCalled();
    expect(extras.geocode).not.toHaveBeenCalled();
    expect(extras.refMiles).not.toHaveBeenCalled();
    // The extras are wired to afterCommit, and only to it.
    afterCommit();
    expect(extras.geofences).toHaveBeenCalledTimes(1);
    expect(extras.geocode).toHaveBeenCalledTimes(1);
    expect(extras.refMiles).toHaveBeenCalledTimes(1);
  });
});
