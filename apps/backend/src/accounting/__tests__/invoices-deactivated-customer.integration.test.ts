/**
 * ACCT-F5611 — LV-INVOICES-LIST-SHOWS-30-OF-37 live path, exercised end-to-end against real
 * Postgres. mdata.customers' own customers_select RLS policy excludes deactivated_at IS NOT NULL
 * rows for a non-bypass reader; the invoices list/count/detail queries used a plain (INNER) JOIN to
 * mdata.customers, so an invoice whose customer was later deactivated silently vanished from the
 * list, the count, and 404'd on its own detail page -- confirmed live on prod: 7 of USMCA's 37
 * invoices belong to a deactivated customer, exactly matching the reported "shows 30 of 37" gap.
 *
 * This suite is the standing proof the fix works: a real authenticated (non-bypass) session must
 * still see the invoice in the list, in the count, and on its detail page after its customer is
 * deactivated, with the customer's real name resolved via mdata.resolve_customer_label_same_company
 * rather than a blank/missing row. Runs only in CI (GITHUB_ACTIONS=true) where a migrated Postgres
 * is available.
 */
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testAuthHeaders } from "../../../test-helpers/auth-fixture.js";
import {
  createIsolatedOperatingCompany,
  ensureIntegrationPrerequisites,
  type IsolatedOperatingCompany,
} from "../../../test-helpers/db-fixture.js";
import { createIntegrationApp } from "../../../test-helpers/http-app.js";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { registerInvoiceRoutes } from "../invoices.routes.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("invoices list survives a deactivated customer (real Postgres)", () => {
  let app: FastifyInstance;
  let db: pg.Client;
  let isolated: IsolatedOperatingCompany;
  let companyId: string;

  const suffix = randomUUID().slice(0, 8);
  const customerId = randomUUID();
  const customerName = `Deactivated Customer ${suffix}`;
  const invoiceId = randomUUID();

  async function bypass<T>(fn: () => Promise<T>): Promise<T> {
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    await db.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
    try {
      const out = await fn();
      await db.query("COMMIT");
      return out;
    } catch (err) {
      await db.query("ROLLBACK").catch(() => {});
      throw err;
    }
  }

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    isolated = await createIsolatedOperatingCompany({ label: "invoices-deactivated-customer" });
    companyId = isolated.companyId;

    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_DIRECT_URL or DATABASE_URL is required");
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await db.query("SET ROLE ih35_app");

    await bypass(async () => {
      await db.query(
        `INSERT INTO mdata.customers (id, operating_company_id, customer_name)
         VALUES ($1::uuid, $2::uuid, $3)`,
        [customerId, companyId, customerName]
      );
      await db.query(
        `INSERT INTO accounting.invoices (id, operating_company_id, customer_id, display_id, due_date, total_cents)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4, CURRENT_DATE + 30, 12500)`,
        [invoiceId, companyId, customerId, `INV-2026-${suffix.slice(0, 5).padStart(5, "0")}`]
      );
      // The whole point of this suite: deactivate the customer AFTER the invoice already cites it.
      await db.query(`UPDATE mdata.customers SET deactivated_at = now() WHERE id = $1::uuid`, [customerId]);
    });

    app = await createIntegrationApp(async (a) => {
      await registerInvoiceRoutes(a);
    });
  });

  afterAll(async () => {
    await app?.close();
    if (db) {
      await bypass(async () => {
        await db.query(`DELETE FROM accounting.invoices WHERE operating_company_id = $1::uuid`, [companyId]);
        await db.query(`DELETE FROM mdata.customers WHERE operating_company_id = $1::uuid`, [companyId]);
      }).catch(() => {});
      await db.end().catch(() => {});
    }
  });

  it("still lists the invoice, with the real customer name resolved, under a real authenticated session", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/accounting/invoices?operating_company_id=${companyId}&limit=50`,
      headers: testAuthHeaders(undefined, "Owner"),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { invoices: Array<{ id: string; customer_name: string | null }>; total?: number };
    const row = body.invoices.find((r) => r.id === invoiceId);
    expect(row).toBeTruthy();
    expect(row?.customer_name).toBe(customerName);
  });

  it("still counts the invoice in the total (not silently dropped from pagination)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/accounting/invoices?operating_company_id=${companyId}&limit=1`,
      headers: testAuthHeaders(undefined, "Owner"),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { total?: number };
    expect(Number(body.total ?? 0)).toBeGreaterThanOrEqual(1);
  });

  it("still resolves the invoice's own detail page, with the real customer name, instead of 404", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/accounting/invoices/${invoiceId}?operating_company_id=${companyId}`,
      headers: testAuthHeaders(undefined, "Owner"),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { customer_name: string | null };
    expect(body.customer_name).toBe(customerName);
  });
});
