import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testAuthHeaders } from "../../test-helpers/auth-fixture.js";
import { createIntegrationApp } from "../../test-helpers/http-app.js";
import { registerApPaymentApplicationRoutes } from "./payment-application.routes.js";

describe("ap payment application routes (smoke)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createIntegrationApp(async (a) => {
      await registerApPaymentApplicationRoutes(a);
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("POST /api/v1/ap/bill-payments rejects unauthenticated callers", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/ap/bill-payments?operating_company_id=${randomUUID()}`,
      payload: {
        vendor_id: randomUUID(),
        paid_at: "2026-01-02",
        amount_cents: 100,
        payment_method: "ach",
        applications: [{ bill_id: randomUUID(), amount_cents: 100 }],
      },
    });
    expect(res.statusCode).toBe(401);
  });

  it("POST /api/v1/ap/bill-payments rejects apply totals greater than payment amount", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/ap/bill-payments?operating_company_id=${randomUUID()}`,
      headers: { "content-type": "application/json", ...testAuthHeaders(undefined, "Owner") },
      payload: {
        vendor_id: randomUUID(),
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

  it("POST /api/v1/ap/bill-payments rejects duplicate bills in applications", async () => {
    const billId = randomUUID();
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/ap/bill-payments?operating_company_id=${randomUUID()}`,
      headers: { "content-type": "application/json", ...testAuthHeaders(undefined, "Owner") },
      payload: {
        vendor_id: randomUUID(),
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

  it("POST /api/v1/ap/bill-payments requires check metadata for check payments", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/ap/bill-payments?operating_company_id=${randomUUID()}`,
      headers: { "content-type": "application/json", ...testAuthHeaders(undefined, "Owner") },
      payload: {
        vendor_id: randomUUID(),
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
