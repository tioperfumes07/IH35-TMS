import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testAuthHeaders } from "../../test-helpers/auth-fixture.js";
import { ensureIntegrationPrerequisites, getOperatingCompanyId } from "../../test-helpers/db-fixture.js";
import { createIntegrationApp } from "../../test-helpers/http-app.js";
import { registerVendorBillPaymentsRoutes } from "./vendor-bill-payments.routes.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("vendor bill payments routes", () => {
  let app: FastifyInstance;
  let companyId: string;
  /** UUID path segment — bill_payments.vendor_id is uuid; non-UUID strings caused Postgres errors (500). */
  let fixtureVendorId: string;

  beforeAll(async () => {
    fixtureVendorId = randomUUID();
    await ensureIntegrationPrerequisites();
    companyId = getOperatingCompanyId();
    app = await createIntegrationApp(async (a) => {
      await registerVendorBillPaymentsRoutes(a);
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /api/v1/vendors/:id/bill-payments rejects unauthenticated callers", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/vendors/vendor-test/bill-payments?operating_company_id=${companyId}`,
    });
    expect(res.statusCode).toBe(401);
  });

  it("GET /api/v1/vendors/:id/bill-payments returns envelope fields", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/vendors/${fixtureVendorId}/bill-payments?operating_company_id=${companyId}&limit=5`,
      headers: testAuthHeaders(undefined, "Owner"),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { rows?: unknown; total?: unknown };
    expect(Array.isArray(body.rows)).toBe(true);
    expect(typeof body.total).toBe("number");
  });

  it("POST /api/v1/vendors/:id/bill-payments rejects apply totals greater than payment amount", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/vendors/${fixtureVendorId}/bill-payments?operating_company_id=${companyId}`,
      headers: { "content-type": "application/json", ...testAuthHeaders(undefined, "Owner") },
      payload: {
        paid_at: "2026-01-02",
        amount_cents: 100,
        payment_method: "ach",
        applications: [{ bill_id: randomUUID(), amount_cents: 200 }],
      },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { error?: string };
    expect(body.error).toBe("payment_apply_exceeds_total");
  });

  it("POST /api/v1/vendors/:id/bill-payments rejects duplicate bills in applications", async () => {
    const billId = randomUUID();
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/vendors/${fixtureVendorId}/bill-payments?operating_company_id=${companyId}`,
      headers: { "content-type": "application/json", ...testAuthHeaders(undefined, "Owner") },
      payload: {
        paid_at: "2026-01-02",
        amount_cents: 500,
        payment_method: "ach",
        applications: [
          { bill_id: billId, amount_cents: 100 },
          { bill_id: billId, amount_cents: 100 },
        ],
      },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { error?: string };
    expect(body.error).toBe("duplicate_bill_in_applications");
  });

  it("POST /api/v1/vendors/:id/bill-payments requires check metadata for check payments", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/vendors/${fixtureVendorId}/bill-payments?operating_company_id=${companyId}`,
      headers: { "content-type": "application/json", ...testAuthHeaders(undefined, "Owner") },
      payload: {
        paid_at: "2026-01-02",
        amount_cents: 500,
        payment_method: "check",
        applications: [{ bill_id: randomUUID(), amount_cents: 100 }],
      },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { error?: string };
    expect(body.error).toBe("check_number_required");
  });
});

describe("vendor bill payments routes (always-on smoke)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createIntegrationApp(async (a) => {
      await registerVendorBillPaymentsRoutes(a);
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /api/v1/vendors/:id/bill-payments rejects unauthenticated callers without DATABASE fixtures", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/vendors/vendor-test/bill-payments?operating_company_id=${randomUUID()}`,
    });
    expect(res.statusCode).toBe(401);
  });
});
