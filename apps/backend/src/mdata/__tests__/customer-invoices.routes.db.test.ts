/**
 * Reverse drill-through: GET /api/v1/customers/:id/invoices — proves it returns rows scoped to the
 * requested customer (accounting.invoices.customer_id) and stays empty for a different customer.
 * Runs only in CI (GITHUB_ACTIONS=true) where a migrated Postgres is available.
 */
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites } from "../../../test-helpers/db-fixture.js";
import { testAuthHeaders } from "../../../test-helpers/auth-fixture.js";
import { createIntegrationApp } from "../../../test-helpers/http-app.js";
import { registerCustomerInvoicesRoutes } from "../customer-invoices.routes.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("GET /api/v1/customers/:id/invoices (real Postgres)", () => {
  let app: FastifyInstance;
  let db: pg.Client;
  let companyId: string;
  const suffix = randomUUID().slice(0, 8);
  let customerA: string;
  let customerB: string;
  let invoiceId: string;

  async function bypass<T>(fn: () => Promise<T>): Promise<T> {
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    await db.query("SELECT set_config('app.operating_company_id', $1, true)", [companyId]);
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
      const custARes = await db.query<{ id: string }>(
        `INSERT INTO mdata.customers (operating_company_id, customer_name) VALUES ($1::uuid, $2) RETURNING id`,
        [companyId, `Invoice Cust A ${suffix}`]
      );
      customerA = custARes.rows[0]!.id;

      const custBRes = await db.query<{ id: string }>(
        `INSERT INTO mdata.customers (operating_company_id, customer_name) VALUES ($1::uuid, $2) RETURNING id`,
        [companyId, `Invoice Cust B ${suffix}`]
      );
      customerB = custBRes.rows[0]!.id;

      const invRes = await db.query<{ id: string }>(
        `INSERT INTO accounting.invoices
           (operating_company_id, customer_id, display_id, status, issue_date, due_date, total_cents)
         VALUES ($1::uuid, $2::uuid, $3, 'draft', CURRENT_DATE, CURRENT_DATE + 30, 150000)
         RETURNING id`,
        [companyId, customerA, `INV-2026-${suffix.replace(/\D/g, "").padEnd(5, "0").slice(0, 5)}`]
      );
      invoiceId = invRes.rows[0]!.id;
    });

    app = await createIntegrationApp(async (a) => {
      await registerCustomerInvoicesRoutes(a);
    });
  });

  afterAll(async () => {
    await app.close();
    await db.end();
  });

  it("returns the seeded invoice for its own customer", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/customers/${customerA}/invoices?operating_company_id=${companyId}`,
      headers: testAuthHeaders(undefined, "Owner"),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { customer_id: string; invoices: Array<{ id: string }> };
    expect(body.customer_id).toBe(customerA);
    expect(body.invoices.some((r) => r.id === invoiceId)).toBe(true);
  });

  it("returns empty invoices for a different customer (no cross-customer leakage)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/customers/${customerB}/invoices?operating_company_id=${companyId}`,
      headers: testAuthHeaders(undefined, "Owner"),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { invoices: Array<{ id: string }> };
    expect(body.invoices.length).toBe(0);
  });

  it("404s for an unknown customer id", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/customers/${randomUUID()}/invoices?operating_company_id=${companyId}`,
      headers: testAuthHeaders(undefined, "Owner"),
    });
    expect(res.statusCode).toBe(404);
  });
});
