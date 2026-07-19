import { beforeEach, describe, expect, it, vi } from "vitest";

const withCurrentUser = vi.fn();
const lookupCarrierByMC = vi.fn();
const lookupCarrierByUSDOT = vi.fn();
const appendCrudAudit = vi.fn(async () => undefined);

vi.mock("../../../auth/db.js", () => ({
  withCurrentUser: (...args: unknown[]) => withCurrentUser(...args),
}));

vi.mock("../../../lib/fmcsa-client.js", () => ({
  lookupCarrierByMC: (...args: unknown[]) => lookupCarrierByMC(...args),
  lookupCarrierByUSDOT: (...args: unknown[]) => lookupCarrierByUSDOT(...args),
}));

vi.mock("../../../audit/crud-audit.js", () => ({
  appendCrudAudit: (...args: unknown[]) => appendCrudAudit(...args),
}));

const CUSTOMER = {
  id: "00000000-0000-4000-8000-0000000000c1",
  operating_company_id: "00000000-0000-4000-8000-0000000000a1",
  customer_name: "Acme Broker",
  mc_number: "12345",
  dot_number: null,
  fmcsa_verified_at: null,
  fmcsa_last_checked_at: null,
  fmcsa_check_response: null,
};

describe("verifyCustomerWithSafer retry taxonomy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    withCurrentUser.mockImplementation(async (_actor: string, fn: (client: { query: ReturnType<typeof vi.fn> }) => unknown) => {
      const client = {
        query: vi.fn(async (sql: string) => {
          if (sql.includes("FROM mdata.customers") && sql.includes("SELECT")) {
            return { rows: [CUSTOMER] };
          }
          if (sql.includes("UPDATE mdata.customers")) {
            return { rows: [{ ...CUSTOMER, fmcsa_last_checked_at: new Date().toISOString() }] };
          }
          if (sql.includes("INSERT INTO catalogs.fmcsa_lookups")) {
            return { rows: [{ id: "lookup-1" }] };
          }
          return { rows: [] };
        }),
      };
      return fn(client);
    });
  });

  it("succeeds and writes verification when carrier is found", async () => {
    lookupCarrierByMC.mockResolvedValue({
      legal_name: "ACME",
      dba_name: null,
      usdot_number: "1111111",
      mc_number: "12345",
      address: { line1: null, city: null, state: null, zip: null },
      phone: null,
      authority_status: "ACTIVE",
      insurance_status: null,
      safety_rating: null,
      raw: {},
    });
    const { verifyCustomerWithSafer } = await import("../safer.service.js");
    const result = await verifyCustomerWithSafer({
      customerId: CUSTOMER.id,
      actorUserId: "00000000-0000-4000-8000-0000000000d1",
      force: true,
      operatingCompanyId: CUSTOMER.operating_company_id,
    });
    expect(result.reason).toBe("verified");
    expect(appendCrudAudit).toHaveBeenCalled();
  });

  it("rethrows retryable without stamping last_checked (no cache poison)", async () => {
    const { FmcsaRetryableError } = await import("../../../lib/fmcsa-http-errors.js");
    lookupCarrierByMC.mockRejectedValue(new FmcsaRetryableError("FMCSA timeout"));
    const { verifyCustomerWithSafer } = await import("../safer.service.js");
    await expect(
      verifyCustomerWithSafer({
        customerId: CUSTOMER.id,
        actorUserId: "00000000-0000-4000-8000-0000000000d1",
        force: true,
      })
    ).rejects.toBeInstanceOf(FmcsaRetryableError);
    expect(withCurrentUser.mock.calls.length).toBe(1);
  });

  it("rethrows permanent 4xx without stamping last_checked", async () => {
    const { FmcsaPermanentError } = await import("../../../lib/fmcsa-http-errors.js");
    lookupCarrierByMC.mockRejectedValue(new FmcsaPermanentError("FMCSA mobile client error 403", { status: 403 }));
    const { verifyCustomerWithSafer } = await import("../safer.service.js");
    await expect(
      verifyCustomerWithSafer({
        customerId: CUSTOMER.id,
        actorUserId: "00000000-0000-4000-8000-0000000000d1",
        force: true,
      })
    ).rejects.toBeInstanceOf(FmcsaPermanentError);
    expect(withCurrentUser.mock.calls.length).toBe(1);
  });

  it("completes when carrier is not found (authoritative null)", async () => {
    lookupCarrierByMC.mockResolvedValue(null);
    const { verifyCustomerWithSafer } = await import("../safer.service.js");
    const result = await verifyCustomerWithSafer({
      customerId: CUSTOMER.id,
      actorUserId: "00000000-0000-4000-8000-0000000000d1",
      force: true,
    });
    expect(result.reason).toBe("lookup_failed_or_not_found");
  });
});
