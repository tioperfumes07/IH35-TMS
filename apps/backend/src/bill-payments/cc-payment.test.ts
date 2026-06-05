import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { registerCcPaymentRoutes } from "./cc-payment.routes.js";
import { buildQboCcBillPaymentPayload } from "./qbo-cc-payment-poster.js";

describe("cc bill payment", () => {
  it("builds QBO CreditCard payload", () => {
    const payload = buildQboCcBillPaymentPayload({
      vendorQboId: "1",
      ccLiabilityQboAccountId: "2",
      paymentDate: "2026-06-05",
      allocations: [{ billId: "b", qboBillId: "qb", amountCents: 500 }],
    });
    expect(payload.PayType).toBe("CreditCard");
  });

  it("rejects unauthenticated POST", async () => {
    const app = Fastify();
    await registerCcPaymentRoutes(app);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/bill-payments/cc?operating_company_id=11111111-1111-4111-8111-111111111111",
      payload: {
        bill_id: "22222222-2222-4222-8222-222222222222",
        cc_account_id: "33333333-3333-4333-8333-333333333333",
        payment_amount_cents: 100,
        payment_date: "2026-06-05",
      },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});
