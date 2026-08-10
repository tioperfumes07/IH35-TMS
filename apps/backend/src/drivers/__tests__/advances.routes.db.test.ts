/**
 * Reverse drill-through: GET /api/v1/drivers/:id/advances — proves it returns rows scoped to the
 * requested driver (driver_finance.driver_advances) and stays empty for a different driver.
 * Runs only in CI (GITHUB_ACTIONS=true) where a migrated Postgres is available.
 */
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites, getOperatingCompanyId } from "../../../test-helpers/db-fixture.js";
import { testAuthHeaders } from "../../../test-helpers/auth-fixture.js";
import { createIntegrationApp } from "../../../test-helpers/http-app.js";
import { registerDriverAdvancesRoutes } from "../advances.routes.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("GET /api/v1/drivers/:id/advances (real Postgres)", () => {
  let app: FastifyInstance;
  let db: pg.Client;
  let companyId: string;
  const suffix = randomUUID().slice(0, 8);
  let driverA: string;
  let driverB: string;
  let advanceId: string;

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
      const driverRes = await db.query<{ id: string }>(
        `INSERT INTO mdata.drivers (operating_company_id, first_name, last_name, phone, status)
         VALUES ($1::uuid, 'Adv', $2, $3, 'Active') RETURNING id`,
        [companyId, `A-${suffix}`, `+1007${suffix.slice(0, 4)}`]
      );
      driverA = driverRes.rows[0]!.id;

      const driverBRes = await db.query<{ id: string }>(
        `INSERT INTO mdata.drivers (operating_company_id, first_name, last_name, phone, status)
         VALUES ($1::uuid, 'Adv', $2, $3, 'Active') RETURNING id`,
        [companyId, `B-${suffix}`, `+1008${suffix.slice(0, 4)}`]
      );
      driverB = driverBRes.rows[0]!.id;

      const liabRes = await db.query<{ id: string }>(
        `INSERT INTO driver_finance.driver_liabilities
           (operating_company_id, driver_id, type, source_description, original_amount, current_balance)
         VALUES ($1::uuid, $2::uuid, 'advance', 'test advance liability', 200.00, 200.00)
         RETURNING id`,
        [companyId, driverA]
      );
      const liabilityId = liabRes.rows[0]!.id;

      const advRes = await db.query<{ id: string }>(
        `INSERT INTO driver_finance.driver_advances
           (operating_company_id, display_id, driver_id, liability_id, amount, purpose,
            disbursement_method, disbursement_status, recipient_type, created_by_user_id, status, outstanding_balance)
         VALUES ($1::uuid, $2, $3::uuid, $4::uuid, 200.00, 'other', 'direct_bank_transfer', 'disbursed', 'driver',
                 $5::uuid, 'outstanding', 200.00)
         RETURNING id`,
        [companyId, `ADV-TEST-${suffix}`, driverA, liabilityId, "f47ac10b-58cc-4372-a567-0e02b2c3d479"]
      );
      advanceId = advRes.rows[0]!.id;
    });

    app = await createIntegrationApp(async (a) => {
      await registerDriverAdvancesRoutes(a);
    });
  });

  afterAll(async () => {
    await app.close();
    await db.end();
  });

  it("returns the seeded advance for its own driver", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/drivers/${driverA}/advances?operating_company_id=${companyId}`,
      headers: testAuthHeaders(undefined, "Owner"),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { driver_id: string; advances: Array<{ id: string }> };
    expect(body.driver_id).toBe(driverA);
    expect(body.advances.some((r) => r.id === advanceId)).toBe(true);
  });

  it("returns empty advances for a different driver (no cross-driver leakage)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/drivers/${driverB}/advances?operating_company_id=${companyId}`,
      headers: testAuthHeaders(undefined, "Owner"),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { advances: Array<{ id: string }> };
    expect(body.advances.length).toBe(0);
  });

  it("404s for an unknown driver id", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/drivers/${randomUUID()}/advances?operating_company_id=${companyId}`,
      headers: testAuthHeaders(undefined, "Owner"),
    });
    expect(res.statusCode).toBe(404);
  });
});
