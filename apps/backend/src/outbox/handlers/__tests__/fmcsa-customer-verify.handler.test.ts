import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyCustomerWithSafer = vi.fn();

vi.mock("../../../integrations/fmcsa/safer.service.js", () => ({
  verifyCustomerWithSafer: (...args: unknown[]) => verifyCustomerWithSafer(...args),
}));

const TENANT_A = "00000000-0000-4000-8000-0000000000a1";
const TENANT_B = "00000000-0000-4000-8000-0000000000b1";
const CUSTOMER_ID = "00000000-0000-4000-8000-0000000000c1";
const ACTOR = "00000000-0000-4000-8000-0000000000d1";
const UPPER_UUID = "AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE";

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

  it("accepts uppercase PostgreSQL UUID shape (case-insensitive)", async () => {
    verifyCustomerWithSafer.mockResolvedValue({ customer: { id: UPPER_UUID }, reason: "verified" });
    const { FmcsaCustomerVerifyHandler } = await import("../fmcsa-customer-verify.handler.js");
    const handler = new FmcsaCustomerVerifyHandler();
    const client = makeClient({ foundForTenant: UPPER_UUID });
    const result = await handler.deliver(
      {
        operating_company_id: UPPER_UUID,
        customer_id: UPPER_UUID,
        actor_user_id: UPPER_UUID,
        trigger: "update",
        lookup_fingerprint: "mc=|dot=1",
      },
      { client: client as never, eventId: "e-upper", instanceId: "t", log: () => {} }
    );
    expect(result?.message).toBe("fmcsa_verify_verified");
    expect(client.query).toHaveBeenCalled();
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

  describe("canonical UUID validation (fail before any DB query)", () => {
    const invalidCases: Array<{ name: string; operating_company_id: string }> = [
      { name: "not-a-uuid string", operating_company_id: "not-a-uuid" },
      // 9-3-4-4-12 = 36 chars of hex+hyphen but not 8-4-4-4-12
      { name: "wrong hyphen placement (same length)", operating_company_id: "000000000-000-4000-8000-0000000000a1" },
      // Exactly 36 hex chars, no hyphens — passes permissive {36} but not PG uuid
      { name: "all-hex 36 chars without hyphens", operating_company_id: "abcdefabcdefabcdefabcdefabcdefabcdef" },
      { name: "too short", operating_company_id: "00000000-0000-4000-8000-0000000000a" },
      { name: "too long", operating_company_id: "00000000-0000-4000-8000-0000000000a11" },
      { name: "missing hyphens but 32 hex", operating_company_id: "000000000000400080000000000000a1" },
      // 7-5-4-4-12 = 36 chars total, wrong groups
      { name: "hyphens only in wrong places (36 hex+hyphen)", operating_company_id: "0000000-00000-4000-8000-0000000000a1" },
    ];

    for (const c of invalidCases) {
      it(`PermanentDeliveryError + zero queries for ${c.name}`, async () => {
        const { FmcsaCustomerVerifyHandler } = await import("../fmcsa-customer-verify.handler.js");
        const { PermanentDeliveryError } = await import("../../delivery-errors.js");
        const handler = new FmcsaCustomerVerifyHandler();
        const client = makeClient();
        await expect(
          handler.deliver(
            {
              operating_company_id: c.operating_company_id,
              customer_id: CUSTOMER_ID,
              actor_user_id: ACTOR,
            },
            { client: client as never, eventId: `bad-${c.name}`, instanceId: "t", log: () => {} }
          )
        ).rejects.toBeInstanceOf(PermanentDeliveryError);
        expect(client.query).not.toHaveBeenCalled();
        expect(verifyCustomerWithSafer).not.toHaveBeenCalled();
      });
    }

    it("PermanentDeliveryError + zero queries for invalid customer_id (all-hex 36)", async () => {
      const { FmcsaCustomerVerifyHandler } = await import("../fmcsa-customer-verify.handler.js");
      const { PermanentDeliveryError } = await import("../../delivery-errors.js");
      const handler = new FmcsaCustomerVerifyHandler();
      const client = makeClient();
      await expect(
        handler.deliver(
          {
            operating_company_id: TENANT_A,
            customer_id: "abcdefabcdefabcdefabcdefabcdefab12",
            actor_user_id: ACTOR,
          },
          { client: client as never, eventId: "bad-cust", instanceId: "t", log: () => {} }
        )
      ).rejects.toBeInstanceOf(PermanentDeliveryError);
      expect(client.query).not.toHaveBeenCalled();
    });
  });
});
