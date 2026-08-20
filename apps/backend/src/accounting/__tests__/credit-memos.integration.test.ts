/**
 * ACCT-F5606 — AR credit memo LIVE PATH exercised end-to-end against real Postgres, mirroring
 * vendor-credits.integration.test.ts's proven AP shape.
 *
 * accounting.credit_memos existed with zero direct create/apply path anywhere in the product
 * (LV-CREDITMEMO-NOPATH) -- it was only ever written as a side effect inside
 * payments/apply.service.ts's overpayment handler. accounting.credit_memo_applications did not
 * exist at all before this finding's migration (202612811300). This suite is the standing proof
 * the new write path works: create -> list -> detail (reverse drill to the credited invoice) ->
 * apply -> refuse cross-customer, over-credit and over-invoice applications -> void reverses the
 * applications. Runs only in CI (GITHUB_ACTIONS=true) where a migrated Postgres is available.
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
import { registerCreditMemosRoutes } from "../credit-memos.routes.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("AR credit memos live path (real Postgres)", () => {
  let app: FastifyInstance;
  let db: pg.Client;
  let isolated: IsolatedOperatingCompany;
  let companyId: string;

  const suffix = randomUUID().slice(0, 8);
  const customerId = randomUUID();
  /** A second customer, to prove a credit memo cannot settle someone else's invoice. */
  const otherCustomerId = randomUUID();
  const invoiceId = randomUUID();
  const otherCustomerInvoiceId = randomUUID();

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
    isolated = await createIsolatedOperatingCompany({ label: "credit-memos" });
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
        [customerId, companyId, `Credit Memo Customer ${suffix}`]
      );
      await db.query(
        `INSERT INTO mdata.customers (id, operating_company_id, customer_name)
         VALUES ($1::uuid, $2::uuid, $3)`,
        [otherCustomerId, companyId, `Other Customer ${suffix}`]
      );
      await db.query(
        `INSERT INTO accounting.invoices (id, operating_company_id, customer_id, display_id, due_date, total_cents)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4, CURRENT_DATE + 30, 50000)`,
        [invoiceId, companyId, customerId, `INV-2026-${suffix.slice(0, 5).padStart(5, "0")}`]
      );
      await db.query(
        `INSERT INTO accounting.invoices (id, operating_company_id, customer_id, display_id, due_date, total_cents)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4, CURRENT_DATE + 30, 50000)`,
        [otherCustomerInvoiceId, companyId, otherCustomerId, `INV-2026-9${suffix.slice(0, 4).padStart(4, "0")}`]
      );
    });

    app = await createIntegrationApp(async (a) => {
      await registerCreditMemosRoutes(a);
    });
  });

  afterAll(async () => {
    await app?.close();
    if (db) {
      await bypass(async () => {
        await db.query(
          `DELETE FROM accounting.credit_memo_applications WHERE operating_company_id = $1::uuid`,
          [companyId]
        );
        await db.query(`DELETE FROM accounting.credit_memos WHERE operating_company_id = $1::uuid`, [companyId]);
        await db.query(`DELETE FROM accounting.invoices WHERE operating_company_id = $1::uuid`, [companyId]);
        await db.query(`DELETE FROM mdata.customers WHERE operating_company_id = $1::uuid`, [companyId]);
      }).catch(() => {});
      await db.end().catch(() => {});
    }
  });

  async function createCreditMemo(amountCents: number, customer = customerId) {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/accounting/credit-memos?operating_company_id=${companyId}`,
      headers: { "content-type": "application/json", ...testAuthHeaders(undefined, "Accountant") },
      payload: { customer_id: customer, amount_cents: amountCents, reason: "other" },
    });
    expect(res.statusCode).toBe(201);
    return res.json() as { id: string; display_id: string; status: string; amount_unapplied_cents: string };
  }

  it("rejects unauthenticated and read-only callers", async () => {
    const anon = await app.inject({
      method: "GET",
      url: `/api/v1/accounting/credit-memos?operating_company_id=${companyId}`,
    });
    expect(anon.statusCode).toBe(401);

    const dispatcher = await app.inject({
      method: "POST",
      url: `/api/v1/accounting/credit-memos?operating_company_id=${companyId}`,
      headers: { "content-type": "application/json", ...testAuthHeaders(undefined, "Dispatcher") },
      payload: { customer_id: customerId, amount_cents: 100, reason: "other" },
    });
    expect(dispatcher.statusCode).toBe(403);
  });

  it("answers 400 for a non-uuid customer and 404 for an unknown one (never a 500)", async () => {
    const malformed = await app.inject({
      method: "POST",
      url: `/api/v1/accounting/credit-memos?operating_company_id=${companyId}`,
      headers: { "content-type": "application/json", ...testAuthHeaders(undefined, "Owner") },
      payload: { customer_id: "not-a-uuid", amount_cents: 100, reason: "other" },
    });
    expect(malformed.statusCode).toBe(400);

    const unknown = await app.inject({
      method: "POST",
      url: `/api/v1/accounting/credit-memos?operating_company_id=${companyId}`,
      headers: { "content-type": "application/json", ...testAuthHeaders(undefined, "Owner") },
      payload: { customer_id: randomUUID(), amount_cents: 100, reason: "other" },
    });
    expect(unknown.statusCode).toBe(404);
    expect((unknown.json() as { error: string }).error).toBe("customer_not_found");
  });

  it("answers 400 for an invalid reason enum", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/accounting/credit-memos?operating_company_id=${companyId}`,
      headers: { "content-type": "application/json", ...testAuthHeaders(undefined, "Owner") },
      payload: { customer_id: customerId, amount_cents: 100, reason: "not_a_real_reason" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("creates a credit memo with a server-generated display id and an audit row", async () => {
    const credit = await createCreditMemo(30000);
    expect(credit.display_id).toMatch(/^CM-\d{4}-\d{4}$/);
    expect(credit.status).toBe("issued");

    const rows = await bypass(async () => {
      const res = await db.query<{ audit_count: string }>(
        `SELECT count(*)::text AS audit_count
           FROM audit.audit_events
          WHERE event_class = 'accounting.credit_memos.created'
            AND payload->>'resource_id' = $1`,
        [credit.id]
      );
      return res.rows;
    });
    expect(Number(rows[0]?.audit_count ?? 0)).toBeGreaterThan(0);

    const list = await app.inject({
      method: "GET",
      url: `/api/v1/accounting/credit-memos?operating_company_id=${companyId}&customer_id=${customerId}`,
      headers: testAuthHeaders(undefined, "Owner"),
    });
    expect(list.statusCode).toBe(200);
    const listed = (list.json() as { credit_memos: Array<{ id: string }> }).credit_memos;
    expect(listed.some((row) => row.id === credit.id)).toBe(true);
  });

  it("numbers concurrent credit memos without colliding on the display id", async () => {
    const [a, b] = await Promise.all([createCreditMemo(1000), createCreditMemo(1000)]);
    expect(a.display_id).not.toBe(b.display_id);
  });

  it("refuses to settle another customer's invoice", async () => {
    const credit = await createCreditMemo(10000);
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/accounting/credit-memos/${credit.id}/apply?operating_company_id=${companyId}`,
      headers: { "content-type": "application/json", ...testAuthHeaders(undefined, "Owner") },
      payload: { applications: [{ invoice_id: otherCustomerInvoiceId, applied_cents: 1000 }] },
    });
    expect(res.statusCode).toBe(422);
    expect((res.json() as { error: string }).error).toBe("invoice_customer_mismatch");

    const applied = await bypass(async () => {
      const out = await db.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM accounting.credit_memo_applications WHERE credit_memo_id = $1::uuid`,
        [credit.id]
      );
      return Number(out.rows[0]?.n ?? 0);
    });
    expect(applied).toBe(0);
  });

  it("applies to the customer's invoice, then refuses over-credit and over-invoice amounts", async () => {
    const credit = await createCreditMemo(20000);

    const applied = await app.inject({
      method: "POST",
      url: `/api/v1/accounting/credit-memos/${credit.id}/apply?operating_company_id=${companyId}`,
      headers: { "content-type": "application/json", ...testAuthHeaders(undefined, "Owner") },
      payload: { applications: [{ invoice_id: invoiceId, applied_cents: 15000 }] },
    });
    expect(applied.statusCode).toBe(200);

    const overCredit = await app.inject({
      method: "POST",
      url: `/api/v1/accounting/credit-memos/${credit.id}/apply?operating_company_id=${companyId}`,
      headers: { "content-type": "application/json", ...testAuthHeaders(undefined, "Owner") },
      payload: { applications: [{ invoice_id: invoiceId, applied_cents: 9000 }] },
    });
    expect(overCredit.statusCode).toBe(422);
    expect((overCredit.json() as { error: string }).error).toBe("over_apply_refused");

    // Detail is the reverse drill: the credit memo must name the invoice it reduced.
    const detail = await app.inject({
      method: "GET",
      url: `/api/v1/accounting/credit-memos/${credit.id}?operating_company_id=${companyId}`,
      headers: testAuthHeaders(undefined, "Owner"),
    });
    expect(detail.statusCode).toBe(200);
    const detailBody = detail.json() as {
      credit_memo: { amount_unapplied_cents: string };
      applications: Array<{ invoice_id: string; applied_cents: string }>;
    };
    expect(Number(detailBody.credit_memo.amount_unapplied_cents)).toBe(5000);
    expect(detailBody.applications.map((row) => row.invoice_id)).toContain(invoiceId);

    // The invoice's remaining balance nets credit memos already applied to it.
    const bigCredit = await createCreditMemo(90000);
    const overInvoice = await app.inject({
      method: "POST",
      url: `/api/v1/accounting/credit-memos/${bigCredit.id}/apply?operating_company_id=${companyId}`,
      headers: { "content-type": "application/json", ...testAuthHeaders(undefined, "Owner") },
      payload: { applications: [{ invoice_id: invoiceId, applied_cents: 40000 }] },
    });
    expect(overInvoice.statusCode).toBe(422);
    expect((overInvoice.json() as { error: string }).error).toBe("applied_cents_exceeds_invoice_balance");
  });

  it("ACCT-F5618 — a retried apply with the same idempotency_key replays the original application instead of double-applying or 500ing", async () => {
    const credit = await createCreditMemo(3000);
    const idempotencyKey = `acct-f5618-${randomUUID()}`;

    const first = await app.inject({
      method: "POST",
      url: `/api/v1/accounting/credit-memos/${credit.id}/apply?operating_company_id=${companyId}`,
      headers: { "content-type": "application/json", ...testAuthHeaders(undefined, "Owner") },
      payload: { applications: [{ invoice_id: invoiceId, applied_cents: 1000, idempotency_key: idempotencyKey }] },
    });
    expect(first.statusCode).toBe(200);
    const firstIds = (first.json() as { applicationIds: string[] }).applicationIds;
    expect(firstIds).toHaveLength(1);

    // Retry: same key, same request. Must return the SAME application id, not a fresh insert or a 500.
    const retry = await app.inject({
      method: "POST",
      url: `/api/v1/accounting/credit-memos/${credit.id}/apply?operating_company_id=${companyId}`,
      headers: { "content-type": "application/json", ...testAuthHeaders(undefined, "Owner") },
      payload: { applications: [{ invoice_id: invoiceId, applied_cents: 1000, idempotency_key: idempotencyKey }] },
    });
    expect(retry.statusCode).toBe(200);
    const retryIds = (retry.json() as { applicationIds: string[] }).applicationIds;
    expect(retryIds).toEqual(firstIds);

    // The credit memo's unapplied balance decreased ONCE (1000), never twice (2000) -- proof the
    // retry did not re-insert or double-count the application.
    const detail = await app.inject({
      method: "GET",
      url: `/api/v1/accounting/credit-memos/${credit.id}?operating_company_id=${companyId}`,
      headers: testAuthHeaders(undefined, "Owner"),
    });
    const detailBody = detail.json() as { credit_memo: { amount_unapplied_cents: string } };
    expect(Number(detailBody.credit_memo.amount_unapplied_cents)).toBe(2000);

    const countRes = await bypass(() =>
      db.query(
        `SELECT count(*)::text AS c FROM accounting.credit_memo_applications WHERE credit_memo_id = $1::uuid AND idempotency_key = $2`,
        [credit.id, idempotencyKey]
      )
    );
    expect(Number(countRes.rows[0].c)).toBe(1);
  });

  it("voids a credit memo and reverses its applications without deleting anything", async () => {
    const credit = await createCreditMemo(8000);
    const applied = await app.inject({
      method: "POST",
      url: `/api/v1/accounting/credit-memos/${credit.id}/apply?operating_company_id=${companyId}`,
      headers: { "content-type": "application/json", ...testAuthHeaders(undefined, "Owner") },
      payload: { applications: [{ invoice_id: invoiceId, applied_cents: 2000 }] },
    });
    expect(applied.statusCode).toBe(200);

    const voided = await app.inject({
      method: "POST",
      url: `/api/v1/accounting/credit-memos/${credit.id}/void?operating_company_id=${companyId}`,
      headers: { "content-type": "application/json", ...testAuthHeaders(undefined, "Owner") },
      payload: { reason: "integration proof" },
    });
    expect(voided.statusCode).toBe(200);

    const state = await bypass(async () => {
      const creditRow = await db.query<{ status: string; amount_applied_cents: string }>(
        `SELECT status, amount_applied_cents::text FROM accounting.credit_memos WHERE id = $1::uuid`,
        [credit.id]
      );
      const applications = await db.query<{ total: string; active: string }>(
        `SELECT count(*)::text AS total,
                count(*) FILTER (WHERE voided_at IS NULL)::text AS active
           FROM accounting.credit_memo_applications
          WHERE credit_memo_id = $1::uuid`,
        [credit.id]
      );
      return { credit: creditRow.rows[0], applications: applications.rows[0] };
    });
    expect(state.credit?.status).toBe("voided");
    expect(Number(state.credit?.amount_applied_cents ?? -1)).toBe(0);
    expect(Number(state.applications?.total ?? 0)).toBe(1);
    expect(Number(state.applications?.active ?? -1)).toBe(0);
  });
});
