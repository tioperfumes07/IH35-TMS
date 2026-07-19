import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyCustomerWithSafer = vi.fn();

vi.mock("../../../integrations/fmcsa/safer.service.js", () => ({
  verifyCustomerWithSafer: (...args: unknown[]) => verifyCustomerWithSafer(...args),
}));

const TENANT_A = "00000000-0000-4000-8000-0000000000a1";
const TENANT_B = "00000000-0000-4000-8000-0000000000b1";
const CUSTOMER_ID = "00000000-0000-4000-8000-0000000000c1";
const ACTOR = "00000000-0000-4000-8000-0000000000d1";

function makeClient(opts: { foundForTenant?: string | null } = {}) {
  const foundForTenant = opts.foundForTenant === undefined ? TENANT_A : opts.foundForTenant;
  return {
    query: vi.fn(async (sql: string, values?: unknown[]) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("FROM mdata.customers")) {
        if (foundForTenant && String(values?.[1]) === foundForTenant) {
          return { rows: [{ id: CUSTOMER_ID }] };
        }
        return { rows: [] };
      }
      return { rows: [] };
    }),
  };
}

describe("FmcsaCustomerVerifyHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delivers success for matching tenant", async () => {
    verifyCustomerWithSafer.mockResolvedValue({ customer: { id: CUSTOMER_ID }, reason: "verified" });
    const { FmcsaCustomerVerifyHandler } = await import("../fmcsa-customer-verify.handler.js");
    const handler = new FmcsaCustomerVerifyHandler();
    const result = await handler.deliver(
      {
        operating_company_id: TENANT_A,
        customer_id: CUSTOMER_ID,
        actor_user_id: ACTOR,
        trigger: "create",
        lookup_fingerprint: "mc=1|dot=",
      },
      { client: makeClient() as never, eventId: "e1", instanceId: "t", log: () => {} }
    );
    expect(result?.message).toBe("fmcsa_verify_verified");
    expect(verifyCustomerWithSafer).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: CUSTOMER_ID,
        operatingCompanyId: TENANT_A,
        force: true,
      })
    );
  });

  it("isolates sibling companies (cross-tenant payload fails permanently)", async () => {
    const { FmcsaCustomerVerifyHandler } = await import("../fmcsa-customer-verify.handler.js");
    const { PermanentDeliveryError } = await import("../../delivery-errors.js");
    const handler = new FmcsaCustomerVerifyHandler();
    await expect(
      handler.deliver(
        {
          operating_company_id: TENANT_B,
          customer_id: CUSTOMER_ID,
          actor_user_id: ACTOR,
        },
        { client: makeClient({ foundForTenant: TENANT_A }) as never, eventId: "e2", instanceId: "t", log: () => {} }
      )
    ).rejects.toBeInstanceOf(PermanentDeliveryError);
    expect(verifyCustomerWithSafer).not.toHaveBeenCalled();
  });

  it("rethrows retryable FMCSA errors for outbox backoff", async () => {
    const { RetryableFmcsaError } = await import("../../../integrations/fmcsa/errors.js");
    verifyCustomerWithSafer.mockRejectedValue(new RetryableFmcsaError("FMCSA timeout"));
    const { FmcsaCustomerVerifyHandler } = await import("../fmcsa-customer-verify.handler.js");
    const handler = new FmcsaCustomerVerifyHandler();
    await expect(
      handler.deliver(
        {
          operating_company_id: TENANT_A,
          customer_id: CUSTOMER_ID,
          actor_user_id: ACTOR,
        },
        { client: makeClient() as never, eventId: "e3", instanceId: "t", log: () => {} }
      )
    ).rejects.toBeInstanceOf(RetryableFmcsaError);
  });

  it("fails permanently on invalid payload (no retry storm)", async () => {
    const { FmcsaCustomerVerifyHandler } = await import("../fmcsa-customer-verify.handler.js");
    const { PermanentDeliveryError } = await import("../../delivery-errors.js");
    const handler = new FmcsaCustomerVerifyHandler();
    await expect(
      handler.deliver(
        { operating_company_id: "not-a-uuid", customer_id: CUSTOMER_ID, actor_user_id: ACTOR },
        { client: makeClient() as never, eventId: "e4", instanceId: "t", log: () => {} }
      )
    ).rejects.toBeInstanceOf(PermanentDeliveryError);
  });
});
