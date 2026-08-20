/**
 * ACCT-ECON-05 — vendor credit LIVE PATH exercised end-to-end against real Postgres.
 *
 * accounting.vendor_credits is empty on prod (Neon lucia 2026-07-25: 0 rows). The path shipped in
 * #3426 was never executed by anyone — no test, no ops row — so nothing proved it worked. It did
 * not: `accounting.bills.vendor_id` holds the QBO vendor id on 16211 of 16212 prod bills while a
 * credit holds an `mdata.vendors.id` uuid, so the apply picker returned zero bills and the credit
 * could never be applied to real A/P.
 *
 * This suite is the standing proof that the write path works: create → list → detail (reverse
 * drill to the credited bill) → apply across the mdata↔QBO vendor bridge → refuse cross-vendor,
 * over-credit and over-bill applications → void reverses the applications. Runs only in CI
 * (GITHUB_ACTIONS=true) where a migrated Postgres is available.
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
import { listBillsByVendor } from "../bills.service.js";
import { registerVendorCreditsRoutes } from "../vendor-credits.routes.js";
import { TEST_OWNER_USER_ID } from "../../../test-helpers/constants.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("vendor credits live path (real Postgres)", () => {
  let app: FastifyInstance;
  let db: pg.Client;
  let isolated: IsolatedOperatingCompany;
  let companyId: string;

  const suffix = randomUUID().slice(0, 8);
  /** Vendor the credit belongs to — carries a QBO id, exactly like a pulled prod vendor. */
  const vendorId = randomUUID();
  const vendorQboId = `QV-${suffix}`;
  /** A second vendor, to prove a credit cannot settle someone else's bill. */
  const otherVendorId = randomUUID();
  /** Bill keyed by the QBO vendor id (the prod shape), not by the mdata uuid. */
  const qboKeyedBillId = randomUUID();
  const otherVendorBillId = randomUUID();

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
    isolated = await createIsolatedOperatingCompany({ label: "vendor-credits" });
    companyId = isolated.companyId;

    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_DIRECT_URL or DATABASE_URL is required");
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await db.query("SET ROLE ih35_app");

    await bypass(async () => {
      await db.query(
        `INSERT INTO mdata.vendors (id, operating_company_id, vendor_name, vendor_type, qbo_vendor_id)
         VALUES ($1::uuid, $2::uuid, $3, 'Other', $4)`,
        [vendorId, companyId, `Credit Vendor ${suffix}`, vendorQboId]
      );
      await db.query(
        `INSERT INTO mdata.vendors (id, operating_company_id, vendor_name, vendor_type)
         VALUES ($1::uuid, $2::uuid, $3, 'Other')`,
        [otherVendorId, companyId, `Other Vendor ${suffix}`]
      );
      await db.query(
        `INSERT INTO accounting.bills (id, operating_company_id, vendor_id, bill_date, status, amount_cents, bill_number)
         VALUES ($1::uuid, $2::uuid, $3, CURRENT_DATE, 'unpaid', 50000, $4)`,
        [qboKeyedBillId, companyId, vendorQboId, `VC-BILL-${suffix}`]
      );
      await db.query(
        `INSERT INTO accounting.bills (id, operating_company_id, vendor_id, bill_date, status, amount_cents, bill_number)
         VALUES ($1::uuid, $2::uuid, $3, CURRENT_DATE, 'unpaid', 50000, $4)`,
        [otherVendorBillId, companyId, otherVendorId, `VC-OTHER-${suffix}`]
      );
    });

    app = await createIntegrationApp(async (a) => {
      await registerVendorCreditsRoutes(a);
    });
  });

  afterAll(async () => {
    await app?.close();
    if (db) {
      await bypass(async () => {
        await db.query(
          `DELETE FROM accounting.vendor_credit_applications WHERE operating_company_id = $1::uuid`,
          [companyId]
        );
        await db.query(`DELETE FROM accounting.vendor_credits WHERE operating_company_id = $1::uuid`, [companyId]);
        await db.query(`DELETE FROM accounting.bills WHERE operating_company_id = $1::uuid`, [companyId]);
        await db.query(`DELETE FROM mdata.vendors WHERE operating_company_id = $1::uuid`, [companyId]);
      }).catch(() => {});
      await db.end().catch(() => {});
    }
  });

  async function createCredit(amountCents: number, vendor = vendorId) {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/accounting/vendor-credits?operating_company_id=${companyId}`,
      headers: { "content-type": "application/json", ...testAuthHeaders(undefined, "Accountant") },
      payload: { vendor_id: vendor, amount_cents: amountCents },
    });
    expect(res.statusCode).toBe(201);
    return res.json() as { id: string; display_id: string; status: string; amount_unapplied_cents: string };
  }

  it("rejects unauthenticated and read-only callers", async () => {
    const anon = await app.inject({
      method: "GET",
      url: `/api/v1/accounting/vendor-credits?operating_company_id=${companyId}`,
    });
    expect(anon.statusCode).toBe(401);

    const dispatcher = await app.inject({
      method: "POST",
      url: `/api/v1/accounting/vendor-credits?operating_company_id=${companyId}`,
      headers: { "content-type": "application/json", ...testAuthHeaders(undefined, "Dispatcher") },
      payload: { vendor_id: vendorId, amount_cents: 100 },
    });
    expect(dispatcher.statusCode).toBe(403);
  });

  it("answers 400 for a non-uuid vendor and 404 for an unknown one (never a 500)", async () => {
    const malformed = await app.inject({
      method: "POST",
      url: `/api/v1/accounting/vendor-credits?operating_company_id=${companyId}`,
      headers: { "content-type": "application/json", ...testAuthHeaders(undefined, "Owner") },
      payload: { vendor_id: "not-a-uuid", amount_cents: 100 },
    });
    expect(malformed.statusCode).toBe(400);

    const unknown = await app.inject({
      method: "POST",
      url: `/api/v1/accounting/vendor-credits?operating_company_id=${companyId}`,
      headers: { "content-type": "application/json", ...testAuthHeaders(undefined, "Owner") },
      payload: { vendor_id: randomUUID(), amount_cents: 100 },
    });
    expect(unknown.statusCode).toBe(404);
    expect((unknown.json() as { error: string }).error).toBe("vendor_not_found");
  });

  it("refuses a GL account it cannot persist instead of dropping it", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/accounting/vendor-credits?operating_company_id=${companyId}`,
      headers: { "content-type": "application/json", ...testAuthHeaders(undefined, "Owner") },
      payload: { vendor_id: vendorId, amount_cents: 100, coa_account_id: randomUUID() },
    });
    expect(res.statusCode).toBe(422);
    expect((res.json() as { error: string }).error).toBe("coa_account_id_not_persisted");
  });

  it("creates a credit with a server-generated display id and an audit row", async () => {
    const credit = await createCredit(30000);
    expect(credit.display_id).toMatch(/^VC-\d{4}-\d{4}$/);
    expect(credit.status).toBe("open");

    const rows = await bypass(async () => {
      const res = await db.query<{ audit_count: string }>(
        `SELECT count(*)::text AS audit_count
           FROM audit.audit_events
          WHERE event_class = 'accounting.vendor_credits.created'
            AND payload->>'resource_id' = $1`,
        [credit.id]
      );
      return res.rows;
    });
    expect(Number(rows[0]?.audit_count ?? 0)).toBeGreaterThan(0);

    const list = await app.inject({
      method: "GET",
      url: `/api/v1/accounting/vendor-credits?operating_company_id=${companyId}&vendor_id=${vendorId}`,
      headers: testAuthHeaders(undefined, "Owner"),
    });
    expect(list.statusCode).toBe(200);
    const listed = (list.json() as { credits: Array<{ id: string }> }).credits;
    expect(listed.some((row) => row.id === credit.id)).toBe(true);
  });

  it("numbers concurrent credits without colliding on the display id", async () => {
    const [a, b] = await Promise.all([createCredit(1000), createCredit(1000)]);
    expect(a.display_id).not.toBe(b.display_id);
  });

  it("lists the vendor's QBO-keyed bills for an mdata vendor uuid", async () => {
    const bills = await listBillsByVendor(TEST_OWNER_USER_ID, companyId, vendorId, {
      limit: 50,
      offset: 0,
      hasBalance: true,
    });
    expect(bills.map((bill) => bill.id)).toContain(qboKeyedBillId);
  });

  it("refuses to settle another vendor's bill", async () => {
    const credit = await createCredit(10000);
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/accounting/vendor-credits/${credit.id}/apply?operating_company_id=${companyId}`,
      headers: { "content-type": "application/json", ...testAuthHeaders(undefined, "Owner") },
      payload: { applications: [{ bill_id: otherVendorBillId, applied_cents: 1000 }] },
    });
    expect(res.statusCode).toBe(422);
    expect((res.json() as { error: string }).error).toBe("bill_vendor_mismatch");

    const applied = await bypass(async () => {
      const out = await db.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM accounting.vendor_credit_applications WHERE credit_id = $1::uuid`,
        [credit.id]
      );
      return Number(out.rows[0]?.n ?? 0);
    });
    expect(applied).toBe(0);
  });

  it("applies to the vendor's bill, then refuses over-credit and over-bill amounts", async () => {
    const credit = await createCredit(20000);

    const applied = await app.inject({
      method: "POST",
      url: `/api/v1/accounting/vendor-credits/${credit.id}/apply?operating_company_id=${companyId}`,
      headers: { "content-type": "application/json", ...testAuthHeaders(undefined, "Owner") },
      payload: { applications: [{ bill_id: qboKeyedBillId, applied_cents: 15000 }] },
    });
    expect(applied.statusCode).toBe(200);

    const overCredit = await app.inject({
      method: "POST",
      url: `/api/v1/accounting/vendor-credits/${credit.id}/apply?operating_company_id=${companyId}`,
      headers: { "content-type": "application/json", ...testAuthHeaders(undefined, "Owner") },
      payload: { applications: [{ bill_id: qboKeyedBillId, applied_cents: 9000 }] },
    });
    expect(overCredit.statusCode).toBe(422);
    expect((overCredit.json() as { error: string }).error).toBe("over_apply_refused");

    // Detail is the reverse drill: the credit must name the bill it reduced.
    const detail = await app.inject({
      method: "GET",
      url: `/api/v1/accounting/vendor-credits/${credit.id}?operating_company_id=${companyId}`,
      headers: testAuthHeaders(undefined, "Owner"),
    });
    expect(detail.statusCode).toBe(200);
    const detailBody = detail.json() as {
      credit: { amount_unapplied_cents: string };
      applications: Array<{ bill_id: string; applied_cents: string }>;
    };
    expect(Number(detailBody.credit.amount_unapplied_cents)).toBe(5000);
    expect(detailBody.applications.map((row) => row.bill_id)).toContain(qboKeyedBillId);

    // The bill's remaining balance nets credits already applied to it.
    const bigCredit = await createCredit(90000);
    const overBill = await app.inject({
      method: "POST",
      url: `/api/v1/accounting/vendor-credits/${bigCredit.id}/apply?operating_company_id=${companyId}`,
      headers: { "content-type": "application/json", ...testAuthHeaders(undefined, "Owner") },
      payload: { applications: [{ bill_id: qboKeyedBillId, applied_cents: 40000 }] },
    });
    expect(overBill.statusCode).toBe(422);
    expect((overBill.json() as { error: string }).error).toBe("applied_cents_exceeds_bill_balance");
  });

  it("ACCT-F5618 — a retried apply with the same idempotency_key replays the original application instead of double-applying or 500ing", async () => {
    const credit = await createCredit(3000);
    const idempotencyKey = `acct-f5618-${randomUUID()}`;

    const first = await app.inject({
      method: "POST",
      url: `/api/v1/accounting/vendor-credits/${credit.id}/apply?operating_company_id=${companyId}`,
      headers: { "content-type": "application/json", ...testAuthHeaders(undefined, "Owner") },
      payload: { applications: [{ bill_id: qboKeyedBillId, applied_cents: 1000, idempotency_key: idempotencyKey }] },
    });
    expect(first.statusCode).toBe(200);
    const firstIds = (first.json() as { applicationIds: string[] }).applicationIds;
    expect(firstIds).toHaveLength(1);

    // Retry: same key, same request. Must return the SAME application id, not a fresh insert or a 500.
    const retry = await app.inject({
      method: "POST",
      url: `/api/v1/accounting/vendor-credits/${credit.id}/apply?operating_company_id=${companyId}`,
      headers: { "content-type": "application/json", ...testAuthHeaders(undefined, "Owner") },
      payload: { applications: [{ bill_id: qboKeyedBillId, applied_cents: 1000, idempotency_key: idempotencyKey }] },
    });
    expect(retry.statusCode).toBe(200);
    const retryIds = (retry.json() as { applicationIds: string[] }).applicationIds;
    expect(retryIds).toEqual(firstIds);

    // The credit's unapplied balance decreased ONCE (1000), never twice (2000) -- proof the retry
    // did not re-insert or double-count the application.
    const detail = await app.inject({
      method: "GET",
      url: `/api/v1/accounting/vendor-credits/${credit.id}?operating_company_id=${companyId}`,
      headers: testAuthHeaders(undefined, "Owner"),
    });
    const detailBody = detail.json() as { credit: { amount_unapplied_cents: string } };
    expect(Number(detailBody.credit.amount_unapplied_cents)).toBe(2000);

    const countRes = await bypass(() =>
      db.query(
        `SELECT count(*)::text AS c FROM accounting.vendor_credit_applications WHERE credit_id = $1::uuid AND idempotency_key = $2`,
        [credit.id, idempotencyKey]
      )
    );
    expect(Number(countRes.rows[0].c)).toBe(1);
  });

  it("voids a credit and reverses its applications without deleting anything", async () => {
    const credit = await createCredit(8000);
    const applied = await app.inject({
      method: "POST",
      url: `/api/v1/accounting/vendor-credits/${credit.id}/apply?operating_company_id=${companyId}`,
      headers: { "content-type": "application/json", ...testAuthHeaders(undefined, "Owner") },
      payload: { applications: [{ bill_id: qboKeyedBillId, applied_cents: 2000 }] },
    });
    expect(applied.statusCode).toBe(200);

    const voided = await app.inject({
      method: "POST",
      url: `/api/v1/accounting/vendor-credits/${credit.id}/void?operating_company_id=${companyId}`,
      headers: { "content-type": "application/json", ...testAuthHeaders(undefined, "Owner") },
      payload: { reason: "integration proof" },
    });
    expect(voided.statusCode).toBe(200);

    const state = await bypass(async () => {
      const creditRow = await db.query<{ status: string; amount_applied_cents: string }>(
        `SELECT status, amount_applied_cents::text FROM accounting.vendor_credits WHERE id = $1::uuid`,
        [credit.id]
      );
      const applications = await db.query<{ total: string; active: string }>(
        `SELECT count(*)::text AS total,
                count(*) FILTER (WHERE voided_at IS NULL)::text AS active
           FROM accounting.vendor_credit_applications
          WHERE credit_id = $1::uuid`,
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
