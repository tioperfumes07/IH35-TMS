import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerDriverEscrowForfeitRoutes } from "../escrow-forfeit.routes.js";
import { dollarsToCents } from "../escrow-forfeit.service.js";

/**
 * SAF-F01 — driver escrow forfeit. Financial cluster; posting is dark by default (flag OFF).
 * These tests exercise the ROUTE contract + the dollars→cents conversion. The full posting path is
 * verified on a Neon branch (real escrow = real money — never on prod), reported UNVERIFIED here.
 */

const COMPANY = "91e0bf0a-133f-4ce8-a734-2586cfa66d96";
const DRIVER = "33333333-3333-4333-8333-333333333333";

const { mockForfeit } = vi.hoisted(() => ({ mockForfeit: vi.fn() }));

vi.mock("../escrow-forfeit.service.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../escrow-forfeit.service.js")>();
  return { ...actual, forfeitDriverEscrow: mockForfeit };
});

vi.mock("../../auth/session-middleware.js", () => ({ requireAuth: () => true }));
vi.mock("../../_helpers/company-membership-guard.js", () => ({
  assertCompanyMembership: vi.fn(async () => undefined),
}));

describe("dollarsToCents — exact ×100, once", () => {
  it("converts dollars to integer cents", () => {
    expect(dollarsToCents(2000)).toBe(200000); // $2,000 → 200,000¢ (NOT 2,000 — the 100× trap)
    expect(dollarsToCents(12.34)).toBe(1234);
    expect(dollarsToCents(0.05)).toBe(5);
  });
  it("rejects non-positive / non-finite", () => {
    expect(() => dollarsToCents(0)).toThrow();
    expect(() => dollarsToCents(-5)).toThrow();
    expect(() => dollarsToCents(Number.NaN)).toThrow();
  });
});

describe("POST /escrow/:driverId/forfeit route", () => {
  let app: FastifyInstance;
  let role = "Owner";

  beforeEach(async () => {
    mockForfeit.mockReset();
    role = "Owner";
    app = Fastify({ logger: false });
    app.decorateRequest("user", null);
    app.addHook("preHandler", async (req) => {
      req.user = { uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", role, email: "owner@ih35.local" };
    });
    await registerDriverEscrowForfeitRoutes(app);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  const body = (over: Record<string, unknown> = {}) => ({
    operating_company_id: COMPANY,
    driver_uuid: DRIVER,
    amount: 500,
    reason: "Trailer door damage, driver at fault",
    ...over,
  });

  const post = (payload: unknown, driverId = DRIVER) =>
    app.inject({ method: "POST", url: `/api/v1/driver-finance/escrow/${driverId}/forfeit`, payload });

  it("is Owner/Administrator only", async () => {
    role = "Safety";
    await app.close();
    app = Fastify({ logger: false });
    app.decorateRequest("user", null);
    app.addHook("preHandler", async (req) => {
      req.user = { uuid: "u", role: "Safety", email: "s@ih35.local" };
    });
    await registerDriverEscrowForfeitRoutes(app);
    await app.ready();
    const res = await post(body());
    expect(res.statusCode).toBe(403);
    expect(mockForfeit).not.toHaveBeenCalled();
  });

  it("rejects a body/path driver mismatch", async () => {
    const res = await post(body(), "99999999-9999-4999-8999-999999999999");
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("driver_id_mismatch");
  });

  it("requires a reason of at least 3 chars", async () => {
    const res = await post(body({ reason: "x" }));
    expect(res.statusCode).toBe(400);
  });

  it("surfaces flag_off as a loud 409 (posting dark by default)", async () => {
    mockForfeit.mockResolvedValue({ result: "flag_off" });
    const res = await post(body());
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("escrow_forfeit_gl_posting_flag_off");
  });

  it("surfaces over_draw as 409 with the balance", async () => {
    mockForfeit.mockResolvedValue({ result: "over_draw", balance_cents: 10000, requested_cents: 50000 });
    const res = await post(body());
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("escrow_forfeit_over_draw");
    expect(res.json().balance_cents).toBe(10000);
  });

  it("surfaces an undesignated damage_recovery account as a loud 409, not a 500", async () => {
    mockForfeit.mockRejectedValue(new Error("No active 'damage_recovery' CoA role designation (chart_of_accounts_roles)"));
    const res = await post(body());
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("damage_recovery_account_undesignated");
  });

  it("returns the posting result on success", async () => {
    mockForfeit.mockResolvedValue({
      result: "posted",
      journal_entry_id: "je-1",
      escrow_posting_id: "ep-1",
      amount_cents: 50000,
      linked_liability_decremented: false,
    });
    const res = await post(body());
    expect(res.statusCode).toBe(200);
    expect(res.json().data.journal_entry_id).toBe("je-1");
  });
});
