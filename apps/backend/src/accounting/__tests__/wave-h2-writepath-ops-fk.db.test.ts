/**
 * WAVE-H2 write-path live proof (owner carry 2026-07-31).
 *
 * Historical null-rates on expenses.load_id / invoices.source_load_id do NOT prove writers stamp FKs.
 * This CI db test creates one expense with load_id and one invoice via from-load, then reads the
 * rows back under lucia + opco GUC — the real proof.
 *
 * Runs only when GITHUB_ACTIONS=true (migrated Postgres available), same gate as other *.db.test.ts.
 */
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testAuthHeaders } from "../../../test-helpers/auth-fixture.js";
import { TEST_OWNER_USER_ID } from "../../../test-helpers/constants.js";
import {
  createIsolatedOperatingCompany,
  deactivateIsolatedOperatingCompany,
  ensureIntegrationPrerequisites,
  type IsolatedOperatingCompany,
} from "../../../test-helpers/db-fixture.js";
import { createIntegrationApp } from "../../../test-helpers/http-app.js";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { registerExpenseRoutes } from "../expenses.routes.js";
import { registerInvoiceRoutes } from "../invoices.routes.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("WAVE-H2 write-path stamps ops FKs (expense load_id + invoice source_load_id)", () => {
  let app: FastifyInstance;
  let db: pg.Client;
  let isolated: IsolatedOperatingCompany;
  let companyId: string;
  const suffix = randomUUID().replace(/-/g, "").slice(0, 8);
  const driverId = randomUUID();
  const customerId = randomUUID();
  const unitId = randomUUID();
  const loadId = randomUUID();
  const revenueAccountId = randomUUID();
  const createdExpenseIds: string[] = [];
  const createdInvoiceIds: string[] = [];

  async function bypass(fn: () => Promise<void>) {
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    if (companyId) await db.query("SELECT set_config('app.operating_company_id', $1, true)", [companyId]);
    try {
      await fn();
      await db.query("COMMIT");
    } catch (e) {
      await db.query("ROLLBACK").catch(() => {});
      throw e;
    }
  }

  async function scopedRead<T = Record<string, unknown>>(sql: string, params: unknown[]): Promise<T[]> {
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    await db.query("SELECT set_config('app.operating_company_id', $1, true)", [companyId]);
    try {
      const r = await db.query(sql, params);
      await db.query("COMMIT");
      return r.rows as T[];
    } catch (e) {
      await db.query("ROLLBACK").catch(() => {});
      throw e;
    }
  }

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    isolated = await createIsolatedOperatingCompany({ label: "h2wp" });
    companyId = isolated.companyId;
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL required");
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await db.query("SET ROLE ih35_app");

    await bypass(async () => {
      // Revenue account + active linehaul map so from-load can resolve invoice line GL.
      await db.query(
        `INSERT INTO catalogs.accounts (
           id, operating_company_id, account_number, account_name, account_type, is_postable
         ) VALUES ($1::uuid, $2::uuid, $3, 'H2WP Linehaul Revenue', 'Income', true)`,
        [revenueAccountId, companyId, `REV${suffix.slice(0, 5)}`],
      );
      await db.query(
        `INSERT INTO accounting.expense_category_account_map (
           operating_company_id, category_kind, category_code, account_id, posting_side, is_active
         ) VALUES ($1::uuid, 'revenue', 'linehaul', $2::uuid, 'credit', true)`,
        [companyId, revenueAccountId],
      );

      await db.query(
        `INSERT INTO mdata.customers (id, operating_company_id, customer_name)
         VALUES ($1::uuid, $2::uuid, $3)`,
        [customerId, companyId, `H2WP Customer ${suffix}`],
      );
      await db.query(
        `INSERT INTO mdata.drivers (id, operating_company_id, first_name, last_name, phone)
         VALUES ($1::uuid, $2::uuid, 'H2', 'Writepath', $3)`,
        [driverId, companyId, `+1555${suffix.slice(0, 7)}`],
      );
      await db.query(
        `INSERT INTO mdata.units (id, owner_company_id, unit_number, vin, is_sample_data)
         VALUES ($1::uuid, $2::uuid, $3, $4, true)`,
        [unitId, companyId, `H2${suffix.slice(0, 4)}`, `1H2WP${suffix}000001`],
      );
      await db.query(
        `INSERT INTO mdata.loads (
           id, operating_company_id, load_number, customer_id, dispatcher_user_id,
           status, assigned_primary_driver_id, assigned_unit_id, rate_total_cents
         ) VALUES (
           $1::uuid, $2::uuid, $3, $4::uuid, $5::uuid,
           'delivered', $6::uuid, $7::uuid, 250000
         )`,
        [loadId, companyId, `L-H2WP-${suffix}`, customerId, TEST_OWNER_USER_ID, driverId, unitId],
      );
    });

    app = await createIntegrationApp(async (a) => {
      await registerExpenseRoutes(a);
      await registerInvoiceRoutes(a);
    });
  });

  afterAll(async () => {
    try {
      await app?.close();
    } catch {
      /* ignore */
    }
    if (!db) return;
    try {
      await bypass(async () => {
        if (createdInvoiceIds.length) {
          await db.query(`DELETE FROM accounting.invoice_lines WHERE invoice_id = ANY($1::uuid[])`, [
            createdInvoiceIds,
          ]);
          await db.query(`DELETE FROM accounting.invoices WHERE id = ANY($1::uuid[])`, [createdInvoiceIds]);
        }
        if (createdExpenseIds.length) {
          await db.query(`DELETE FROM accounting.expense_lines WHERE expense_id = ANY($1::uuid[])`, [
            createdExpenseIds,
          ]);
          await db.query(`DELETE FROM accounting.expenses WHERE id = ANY($1::uuid[])`, [createdExpenseIds]);
        }
        await db.query(
          `DELETE FROM accounting.expense_category_account_map
            WHERE operating_company_id = $1::uuid AND category_kind = 'revenue' AND category_code = 'linehaul'`,
          [companyId],
        );
        await db.query(`DELETE FROM catalogs.accounts WHERE id = $1::uuid`, [revenueAccountId]);
        await db.query(`DELETE FROM mdata.loads WHERE id = $1::uuid`, [loadId]);
        await db.query(`DELETE FROM mdata.units WHERE id = $1::uuid`, [unitId]);
        await db.query(`DELETE FROM mdata.drivers WHERE id = $1::uuid`, [driverId]);
        await db.query(`DELETE FROM mdata.customers WHERE id = $1::uuid`, [customerId]);
      });
    } catch {
      /* best-effort */
    }
    try {
      if (isolated) {
        await db.query("BEGIN");
        await db.query("SET LOCAL app.bypass_rls = 'lucia'");
        await deactivateIsolatedOperatingCompany(db, isolated);
        await db.query("COMMIT");
      }
    } catch {
      await db.query("ROLLBACK").catch(() => {});
    }
    await db.end().catch(() => {});
  });

  it("POST /api/v1/expenses with load_id persists accounting.expenses.load_id", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/expenses",
      headers: { "content-type": "application/json", ...testAuthHeaders() },
      payload: {
        operating_company_id: companyId,
        driver_id: driverId,
        load_id: loadId,
        expense_date: "2026-07-31",
        amount_cents: 1250,
        memo: `H2 write-path proof ${suffix}`,
      },
    });
    // Create returns 201 when a new expense row is inserted (200 only on rare idempotent paths).
    expect([200, 201].includes(res.statusCode), res.body).toBe(true);
    const body = res.json() as { expense_id?: string; id?: string };
    const expenseId = body.expense_id ?? body.id;
    expect(expenseId).toBeTruthy();
    createdExpenseIds.push(String(expenseId));

    const rows = await scopedRead<{ load_id: string | null }>(
      `SELECT load_id::text AS load_id FROM accounting.expenses WHERE id = $1::uuid`,
      [expenseId],
    );
    expect(rows[0]?.load_id).toBe(loadId);
  });

  it("POST /api/v1/accounting/invoices/from-load persists accounting.invoices.source_load_id", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/accounting/invoices/from-load?operating_company_id=${companyId}`,
      headers: { "content-type": "application/json", ...testAuthHeaders() },
      payload: { load_id: loadId },
    });
    expect([200, 201].includes(res.statusCode), res.body).toBe(true);
    const body = res.json() as { invoice?: { id?: string }; id?: string };
    const invoiceId = body.invoice?.id ?? body.id;
    expect(invoiceId).toBeTruthy();
    createdInvoiceIds.push(String(invoiceId));

    const rows = await scopedRead<{ source_load_id: string | null }>(
      `SELECT source_load_id::text AS source_load_id FROM accounting.invoices WHERE id = $1::uuid`,
      [invoiceId],
    );
    expect(rows[0]?.source_load_id).toBe(loadId);
  });
});
