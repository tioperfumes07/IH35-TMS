// FIN-22 — lease posting ROUTES wiring test (hermetic; no DB). Proves the HTTP surface that wires the
// already-built + tested poster (see __tests__/lease-gl-posting.db.test.ts for the balancing/no-op poster
// proof against real Postgres). Here we prove the ROUTE layer:
//   * finance-role gate (403 for non-finance),
//   * flag-OFF passthrough — poster returns { result: "skipped_flag_off" } -> 200, zero-JE no-op is honoured,
//   * posted -> 201,
//   * LeasePostingError -> mapped status (RETITLE_REQUIRED -> 409),
//   * body validation -> 4xx (never a silent post),
//   * lifecycle create -> 201.
import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LeasePostingError } from "./lease.math.js";

const OPCO = "11111111-1111-4111-8111-111111111111";
const LEASE = "22222222-2222-4222-8222-222222222222";
const q = `?operating_company_id=${OPCO}`;

const authState = { role: "Owner" as string | null, uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" };

const { rentalMock, saleMock, commenceMock, interestMock, createMock, addAssetMock, genSchedMock, activateMock } = vi.hoisted(() => ({
  rentalMock: vi.fn(),
  saleMock: vi.fn(),
  commenceMock: vi.fn(),
  interestMock: vi.fn(),
  createMock: vi.fn(),
  addAssetMock: vi.fn(),
  genSchedMock: vi.fn(),
  activateMock: vi.fn(),
}));

vi.mock("../shared.js", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return {
    ...actual,
    currentAuthUser: () => (authState.role ? { uuid: authState.uuid, role: authState.role } : null),
  };
});
vi.mock("../../_helpers/company-membership-guard.js", () => ({ assertCompanyMembership: async () => {} }));
vi.mock("./lease-posting.service.js", () => ({
  postOperatingRentalPeriod: rentalMock,
  postOperatingEndOfTermSale: saleMock,
  postSalesTypeCommencement: commenceMock,
  postSalesTypeInterestPeriod: interestMock,
}));
vi.mock("./lease.service.js", () => ({
  createLeaseContract: createMock,
  addLeaseAsset: addAssetMock,
  generateScheduleForLease: genSchedMock,
  activateLease: activateMock,
}));

const apps: Array<{ close: () => Promise<void> }> = [];
afterEach(async () => {
  for (const a of apps.splice(0)) await a.close();
  vi.clearAllMocks();
  authState.role = "Owner";
});

async function build() {
  const app = Fastify();
  apps.push(app);
  const plugin = (await import("./lease-posting.routes.js")).default;
  await app.register(plugin);
  return app;
}

const rentalUrl = `/api/v1/accounting/lease-posting/operating/rental${q}`;

describe("FIN-22 lease posting routes — wiring, gate, flag-OFF passthrough, error map", () => {
  it("403 for a non-finance role (never reaches the poster)", async () => {
    authState.role = "Driver";
    const app = await build();
    const res = await app.inject({ method: "POST", url: rentalUrl, payload: { lease_contract_id: LEASE, period_number: 1 } });
    expect(res.statusCode).toBe(403);
    expect(rentalMock).not.toHaveBeenCalled();
  });

  it("flag OFF -> poster no-op passthrough (skipped_flag_off, HTTP 200, no JE)", async () => {
    rentalMock.mockResolvedValue({ result: "skipped_flag_off", journal_entry_id: null, lease_contract_id: LEASE });
    const app = await build();
    const res = await app.inject({ method: "POST", url: rentalUrl, payload: { lease_contract_id: LEASE, period_number: 1 } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ result: "skipped_flag_off", journal_entry_id: null });
    expect(rentalMock).toHaveBeenCalledWith(
      { operatingCompanyId: OPCO, leaseContractId: LEASE, periodNumber: 1 },
      { userId: authState.uuid }
    );
  });

  it("posted -> HTTP 201 with balanced totals passthrough", async () => {
    rentalMock.mockResolvedValue({
      result: "posted",
      journal_entry_id: "33333333-3333-4333-8333-333333333333",
      lease_contract_id: LEASE,
      idempotency_key: "k",
      debit_total_cents: 250000,
      credit_total_cents: 250000,
    });
    const app = await build();
    const res = await app.inject({ method: "POST", url: rentalUrl, payload: { lease_contract_id: LEASE, period_number: 1 } });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ result: "posted", debit_total_cents: 250000, credit_total_cents: 250000 });
  });

  it("RETITLE_REQUIRED -> HTTP 409 (poster precondition surfaced, not swallowed)", async () => {
    rentalMock.mockRejectedValue(new LeasePostingError("RETITLE_REQUIRED", "re-title to TRK first"));
    const app = await build();
    const res = await app.inject({ method: "POST", url: rentalUrl, payload: { lease_contract_id: LEASE, period_number: 1 } });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: "RETITLE_REQUIRED" });
  });

  it("LEASE_NOT_OPERATING -> HTTP 422", async () => {
    rentalMock.mockRejectedValue(new LeasePostingError("LEASE_NOT_OPERATING", "sales-type lease"));
    const app = await build();
    const res = await app.inject({ method: "POST", url: rentalUrl, payload: { lease_contract_id: LEASE, period_number: 1 } });
    expect(res.statusCode).toBe(422);
  });

  it("invalid body -> 4xx validation, never posts", async () => {
    const app = await build();
    const res = await app.inject({ method: "POST", url: rentalUrl, payload: { lease_contract_id: LEASE } }); // missing period_number
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).not.toBe(201);
    expect(rentalMock).not.toHaveBeenCalled();
  });

  it("sales-type commencement + end-of-term sale routes delegate to their posters", async () => {
    commenceMock.mockResolvedValue({ result: "skipped_flag_off", journal_entry_id: null, lease_contract_id: LEASE });
    saleMock.mockResolvedValue({ result: "skipped_flag_off", journal_entry_id: null, lease_contract_id: LEASE });
    const app = await build();
    const c = await app.inject({ method: "POST", url: `/api/v1/accounting/lease-posting/sales-type/commencement${q}`, payload: { lease_contract_id: LEASE } });
    expect(c.statusCode).toBe(200);
    expect(commenceMock).toHaveBeenCalledWith({ operatingCompanyId: OPCO, leaseContractId: LEASE }, { userId: authState.uuid });
    const s = await app.inject({ method: "POST", url: `/api/v1/accounting/lease-posting/operating/end-of-term-sale${q}`, payload: { lease_contract_id: LEASE, disposal_date: "2026-07-05", proceeds_cents: 500000 } });
    expect(s.statusCode).toBe(200);
    expect(saleMock).toHaveBeenCalledWith({ operatingCompanyId: OPCO, leaseContractId: LEASE, disposalDate: "2026-07-05", proceedsCents: 500000 }, { userId: authState.uuid });
  });

  it("lifecycle: create lease contract -> HTTP 201", async () => {
    createMock.mockResolvedValue({ id: LEASE });
    const app = await build();
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/accounting/lease-posting/leases${q}`,
      payload: {
        lessor_operating_company_id: OPCO,
        lessee_name: "IH 35 Transportation LLC",
        commencement_date: "2026-07-05",
        end_date: "2027-07-05",
        payment_amount_cents: 250000,
        payment_frequency: "monthly",
        number_of_periods: 12,
        total_lease_payments_cents: 3000000,
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ id: LEASE });
    expect(createMock).toHaveBeenCalledTimes(1);
  });
});
