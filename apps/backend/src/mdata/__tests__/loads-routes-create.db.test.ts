/**
 * POST /api/v1/mdata/loads (real Postgres) -- proves the E20/Lead-ordered rewire onto
 * createLoadWithFullSideEffects: a legal-status create succeeds and writes through the shared
 * path (charges/stops/dispatch spine all real, not a raw INSERT INTO mdata.loads any more), an
 * illegal initial status is REJECTED and NAMED (never silently coerced), and MXN is rejected
 * rather than silently defaulted to USD. Runs only in CI (GITHUB_ACTIONS=true) per this repo's
 * `.db.test.ts` convention -- see the sibling files in apps/backend/src/integrations/edi/
 * __tests__/ and apps/backend/src/onboarding/__tests__/ for why forcing this locally against
 * production hits an RLS-GUC gap a raw test connection can't satisfy.
 */
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites } from "../../../test-helpers/db-fixture.js";
import { testAuthHeaders } from "../../../test-helpers/auth-fixture.js";
import { createIntegrationApp } from "../../../test-helpers/http-app.js";
import { registerLoadRoutes } from "../loads.routes.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("POST /api/v1/mdata/loads (real Postgres, shared create path)", () => {
  let app: FastifyInstance;
  let db: pg.Client;
  let companyId: string;
  const suffix = randomUUID().slice(0, 8);
  let customerId: string;

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

  beforeAll(async () => {
    companyId = await ensureIntegrationPrerequisites();
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_DIRECT_URL or DATABASE_URL is required");
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();

    await bypass(async () => {
      const customerRes = await db.query<{ id: string }>(
        `INSERT INTO mdata.customers (operating_company_id, customer_name)
         VALUES ($1::uuid, $2) RETURNING id`,
        [companyId, `Create-Path Customer ${suffix}`]
      );
      customerId = customerRes.rows[0]!.id;
    });

    app = await createIntegrationApp(async (a) => {
      await registerLoadRoutes(a);
    });
  });

  afterAll(async () => {
    await app.close();
    await db.end();
  });

  it("creates a draft load through the shared path: charges, stops, and dispatch spine event all real", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/mdata/loads",
      headers: testAuthHeaders(undefined, "Owner"),
      payload: {
        operating_company_id: companyId,
        customer_id: customerId,
        status: "draft",
        rate_total_cents: 150000,
        currency_code: "USD",
        pickup: {
          city: "Laredo",
          state: "TX",
          country: "USA",
          scheduled_arrival_at: "2026-10-01T12:00:00.000Z",
        },
        delivery: {
          city: "San Antonio",
          state: "TX",
          country: "USA",
          scheduled_arrival_at: "2026-10-02T12:00:00.000Z",
        },
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { id: string; status: string; operating_company_id: string };
    expect(body.status).toBe("draft");
    expect(body.operating_company_id).toBe(companyId);

    const charges = await bypass(() =>
      db.query<{ amount_cents: number }>(
        `SELECT amount_cents FROM dispatch.load_charge_lines WHERE load_id = $1::uuid`,
        [body.id]
      )
    );
    expect(charges.rows.some((r) => Number(r.amount_cents) === 150000)).toBe(true);

    const stops = await bypass(() =>
      db.query<{ stop_type: string; city: string }>(
        `SELECT stop_type, city FROM mdata.load_stops WHERE load_id = $1::uuid ORDER BY sequence_number`,
        [body.id]
      )
    );
    expect(stops.rows.map((r) => r.stop_type)).toEqual(["pickup", "delivery"]);
    expect(stops.rows[0]?.city).toBe("Laredo");
  });

  it("REJECTS an already-progressed status at create time -- named, never silently squashed", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/mdata/loads",
      headers: testAuthHeaders(undefined, "Owner"),
      payload: {
        operating_company_id: companyId,
        customer_id: customerId,
        status: "delivered",
      },
    });
    expect(res.statusCode).toBe(422);
    const body = res.json() as { error: string; status: string };
    expect(body.error).toBe("status_not_creatable");
    expect(body.status).toBe("delivered");
  });

  it("REJECTS MXN rather than silently defaulting to USD (createLoadWithFullSideEffects hardcodes USD)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/mdata/loads",
      headers: testAuthHeaders(undefined, "Owner"),
      payload: {
        operating_company_id: companyId,
        customer_id: customerId,
        status: "draft",
        currency_code: "MXN",
      },
    });
    expect(res.statusCode).toBe(422);
    expect((res.json() as { error: string }).error).toBe("currency_not_supported_on_create");
  });

  it("still 400s on an unknown customer, same as before the rewire", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/mdata/loads",
      headers: testAuthHeaders(undefined, "Owner"),
      payload: {
        operating_company_id: companyId,
        customer_id: randomUUID(),
        status: "draft",
      },
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: string }).error).toBe("invalid_customer_for_company");
  });
});
