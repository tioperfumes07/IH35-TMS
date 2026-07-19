import { describe, expect, it } from "vitest";
import { buildOutboxHandlerRegistry } from "../handlers/registry.js";
import { FMCSA_CUSTOMER_VERIFY_EVENT_TYPE } from "../../integrations/fmcsa/fmcsa-customer-verify-chain.service.js";

describe("outbox registry — FMCSA customer verify", () => {
  it("registers fmcsa.customer.verify_requested", () => {
    const registry = buildOutboxHandlerRegistry();
    expect(registry.get(FMCSA_CUSTOMER_VERIFY_EVENT_TYPE)?.eventType).toBe(FMCSA_CUSTOMER_VERIFY_EVENT_TYPE);
  });
});
