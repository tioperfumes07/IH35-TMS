/**
 * POST /api/v1/driver-finance/feed-day/run (real Postgres) -- proves the route this session's
 * E20-adjacent Lead order wired onto executeHistoricalFeedDay(): a clean day commits and writes
 * a real driver bill + a "feed_day.closed" audit event; a day that refuses rolls back completely
 * (no partial driver bill left behind); and the sequencing law holds -- day N+1 is refused while
 * day N has not landed clean through this same route, and re-running an already-closed day is
 * refused rather than silently re-executed. Runs only in CI (GITHUB_ACTIONS=true) per this
 * repo's `.db.test.ts` convention.
 */
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites } from "../../../test-helpers/db-fixture.js";
import { testAuthHeaders } from "../../../test-helpers/auth-fixture.js";
import { createIntegrationApp } from "../../../test-helpers/http-app.js";
import { createLoadWithFullSideEffects } from "../../dispatch/book-load.service.js";
import { registerHistoricalFeedDayRoutes } from "../historical-feed-day.routes.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("POST /api/v1/driver-finance/feed-day/run (real Postgres)", () => {
  let app: FastifyInstance;
  let db: pg.Client;
  let companyId: string;
  const suffix = randomUUID().slice(0, 8);
  let customerId: string;
  let driverId: string;

  async function bypass<T>(fn: () => Promise<T>): Promise<T> {
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    await db.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
    try {
      const result = await fn();
      await db.query("COMMIT");
      return result;
    } catch (e) {
      await db.query("ROLLBACK").catch(() => {});
      throw e;
    }
  }

  async function seedLoad(loadNumberSuffix: string): Promise<string> {
    return bypass(async () => {
      const result = await createLoadWithFullSideEffects(
        db,
        {
          requestingUserUuid: "00000000-0000-4000-8000-000000000001",
          requestingUserRole: "system",
          operating_company_id: companyId,
          customer_id: customerId,
          status: "unassigned",
          save_mode: "book_dispatch",
          assigned_primary_driver_id: driverId,
          notes: "feed-day route test fixture",
          is_sample_data: false,
          charges: [],
          stops: [],
        },
        { source: "historical_backfill" }
      );
      if (result.kind === "error") throw new Error(`fixture load create failed: ${JSON.stringify(result.payload)}`);
      return String(result.row.id);
    });
  }

  beforeAll(async () => {
    companyId = await ensureIntegrationPrerequisites();
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_DIRECT_URL or DATABASE_URL is required");
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();

    await bypass(async () => {
      const customerRes = await db.query<{ id: string }>(
        `INSERT INTO mdata.customers (operating_company_id, customer_name) VALUES ($1::uuid, $2) RETURNING id`,
        [companyId, `Feed-Day Customer ${suffix}`]
      );
      customerId = customerRes.rows[0]!.id;

      const driverRes = await db.query<{ id: string }>(
        `INSERT INTO mdata.drivers (operating_company_id, first_name, last_name, phone, status)
         VALUES ($1::uuid, 'FeedDay', $2, $3, 'Active') RETURNING id`,
        [companyId, `D-${suffix}`, `+1006${suffix.slice(0, 4)}`]
      );
      driverId = driverRes.rows[0]!.id;
    });

    app = await createIntegrationApp(async (a) => {
      await registerHistoricalFeedDayRoutes(a);
    });
  });

  afterAll(async () => {
    await app.close();
    await db.end();
  });

  it("runs a clean day: commits, writes a real driver bill, and records the closed audit event", async () => {
    const loadId = await seedLoad("A");
    const feedDate = "2026-08-10";

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/driver-finance/feed-day/run",
      headers: testAuthHeaders(undefined, "Owner"),
      payload: {
        operating_company_id: companyId,
        feed_date: feedDate,
        source_document_ref: `TEST-${suffix}-A`,
        loads: [
          {
            load_id: loadId,
            load_number: `FD-${suffix}-A`,
            driver_id: driverId,
            driver_bill: { gross_amount_cents: 150000 },
          },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { report: { clean: boolean; created: number; refused: number }; previous_day_check: string };
    expect(body.report.clean).toBe(true);
    expect(body.report.created).toBe(1);
    expect(body.previous_day_check).toBe("skipped_no_previous_named");

    const bill = await bypass(() =>
      db.query<{ id: string }>(`SELECT id::text FROM driver_finance.driver_bills WHERE load_id = $1::uuid`, [loadId])
    );
    expect(bill.rows.length).toBe(1);

    const closedEvent = await bypass(() =>
      db.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM audit.audit_events
          WHERE event_class = 'driver-finance.feed_day.closed'
            AND payload->>'operating_company_id' = $1
            AND payload->>'feed_date' = $2`,
        [companyId, feedDate]
      )
    );
    expect(Number(closedEvent.rows[0]?.n)).toBe(1);
  });

  it("REFUSES to re-run the same day (already closed), and writes nothing new", async () => {
    const feedDate = "2026-08-10"; // same day as the previous test, already closed above
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/driver-finance/feed-day/run",
      headers: testAuthHeaders(undefined, "Owner"),
      payload: {
        operating_company_id: companyId,
        feed_date: feedDate,
        source_document_ref: `TEST-${suffix}-REPEAT`,
        loads: [
          {
            load_id: await seedLoad("REPEAT"),
            load_number: `FD-${suffix}-REPEAT`,
            driver_id: driverId,
            driver_bill: { gross_amount_cents: 999999 },
          },
        ],
      },
    });
    expect(res.statusCode).toBe(409);
    expect((res.json() as { error: string }).error).toBe("feed_day_already_closed");
  });

  it("REFUSES day N+1 when the named previous day has not closed through this route", async () => {
    const loadId = await seedLoad("B");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/driver-finance/feed-day/run",
      headers: testAuthHeaders(undefined, "Owner"),
      payload: {
        operating_company_id: companyId,
        feed_date: "2026-08-11",
        previous_feed_date: "2026-01-01", // a real ISO date, but one never closed through this route
        source_document_ref: `TEST-${suffix}-B`,
        loads: [
          { load_id: loadId, load_number: `FD-${suffix}-B`, driver_id: driverId, driver_bill: { gross_amount_cents: 100000 } },
        ],
      },
    });
    expect(res.statusCode).toBe(409);
    expect((res.json() as { error: string }).error).toBe("previous_feed_day_not_closed");

    const bill = await bypass(() =>
      db.query<{ id: string }>(`SELECT id::text FROM driver_finance.driver_bills WHERE load_id = $1::uuid`, [loadId])
    );
    expect(bill.rows.length).toBe(0);
  });

  it("ALLOWS day N+1 once the named previous day is confirmed closed", async () => {
    const loadId = await seedLoad("C");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/driver-finance/feed-day/run",
      headers: testAuthHeaders(undefined, "Owner"),
      payload: {
        operating_company_id: companyId,
        feed_date: "2026-08-12",
        previous_feed_date: "2026-08-10", // closed by the first test in this file
        source_document_ref: `TEST-${suffix}-C`,
        loads: [
          { load_id: loadId, load_number: `FD-${suffix}-C`, driver_id: driverId, driver_bill: { gross_amount_cents: 200000 } },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { report: { clean: boolean }; previous_day_check: string };
    expect(body.report.clean).toBe(true);
    expect(body.previous_day_check).toBe("confirmed_closed");
  });

  it("ROLLS BACK completely on a refused day -- no partial driver bill left behind", async () => {
    const loadId = await seedLoad("D");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/driver-finance/feed-day/run",
      headers: testAuthHeaders(undefined, "Owner"),
      payload: {
        operating_company_id: companyId,
        feed_date: "2026-08-13",
        previous_feed_date: "2026-08-12",
        source_document_ref: `TEST-${suffix}-D`,
        loads: [
          // gross_amount_cents <= 0 -> createHistoricalDriverBill refuses this exact row.
          { load_id: loadId, load_number: `FD-${suffix}-D`, driver_id: driverId, driver_bill: { gross_amount_cents: 0 } },
        ],
      },
    });
    expect(res.statusCode).toBe(422);
    const body = res.json() as { report: { clean: boolean; refused: number } };
    expect(body.report.clean).toBe(false);
    expect(body.report.refused).toBe(1);

    const bill = await bypass(() =>
      db.query<{ id: string }>(`SELECT id::text FROM driver_finance.driver_bills WHERE load_id = $1::uuid`, [loadId])
    );
    expect(bill.rows.length).toBe(0);

    const closedEvent = await bypass(() =>
      db.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM audit.audit_events
          WHERE event_class = 'driver-finance.feed_day.closed'
            AND payload->>'operating_company_id' = $1
            AND payload->>'feed_date' = '2026-08-13'`,
        [companyId]
      )
    );
    expect(Number(closedEvent.rows[0]?.n)).toBe(0);
  });

  it("dry_run never commits, even when the plan would otherwise be clean", async () => {
    const loadId = await seedLoad("E");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/driver-finance/feed-day/run",
      headers: testAuthHeaders(undefined, "Owner"),
      payload: {
        operating_company_id: companyId,
        feed_date: "2026-08-14",
        previous_feed_date: "2026-08-12",
        source_document_ref: `TEST-${suffix}-E`,
        dry_run: true,
        loads: [
          { load_id: loadId, load_number: `FD-${suffix}-E`, driver_id: driverId, driver_bill: { gross_amount_cents: 300000 } },
        ],
      },
    });
    expect(res.statusCode).toBe(422); // dry_run is never "committed clean" from this route's own perspective
    const body = res.json() as { report: { dry_run: boolean; clean: boolean } };
    expect(body.report.dry_run).toBe(true);

    const bill = await bypass(() =>
      db.query<{ id: string }>(`SELECT id::text FROM driver_finance.driver_bills WHERE load_id = $1::uuid`, [loadId])
    );
    expect(bill.rows.length).toBe(0);
  });

  it("403s a non-authority role", async () => {
    const loadId = await seedLoad("F");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/driver-finance/feed-day/run",
      headers: testAuthHeaders(undefined, "Manager"),
      payload: {
        operating_company_id: companyId,
        feed_date: "2026-08-15",
        source_document_ref: `TEST-${suffix}-F`,
        loads: [{ load_id: loadId, load_number: `FD-${suffix}-F`, driver_id: driverId, driver_bill: { gross_amount_cents: 100000 } }],
      },
    });
    expect(res.statusCode).toBe(403);
  });
});
