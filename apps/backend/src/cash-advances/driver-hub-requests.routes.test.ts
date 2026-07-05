import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// DHUB-1: these routes move money (approve books a settlement deduction), so the
// test proves they are (a) reachable once registered (no 404), (b) role-gated to
// Manager/Owner/Administrator (403 otherwise), and (c) persist the approve/deny +
// audit through the shared service. Route wiring is the regression target — the
// finding was that registerDriverHubRequestRoutes was defined but never called.

const mockQuery = vi.fn();
const mockAssertMembership = vi.fn();

vi.mock("../auth/db.js", () => ({
  withCurrentUser: async (_userId: string, fn: (client: { query: typeof mockQuery }) => Promise<unknown>) =>
    fn({ query: mockQuery }),
}));

const mockRequireAuth = vi.fn(() => true);
vi.mock("../auth/session-middleware.js", () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}));

vi.mock("../_helpers/company-membership-guard.js", () => ({
  assertCompanyMembership: (...args: unknown[]) => mockAssertMembership(...args),
}));

vi.mock("../audit/crud-audit.js", () => ({
  appendCrudAudit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../driver-finance/deductions.service.js", () => ({
  createSettlementDeduction: vi.fn().mockResolvedValue({ id: "ded00000-0000-0000-0000-0000000000AA" }),
}));

import { registerDriverHubRequestRoutes } from "./driver-hub-requests.routes.js";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { createSettlementDeduction } from "../driver-finance/deductions.service.js";

const OC = "0c000000-0000-4000-8000-000000000001";
const REQ_ID = "5e900000-0000-4000-8000-000000000001";

function futureIso() {
  return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
}

const PENDING_ROW = {
  id: REQ_ID,
  driver_id: "d5000000-0000-4000-8000-000000000001",
  display_id: "CA-2026-0007",
  status: "pending",
  requested_amount_cents: "50000",
  expires_at: futureIso(),
  is_above_policy: false,
  load_id: null,
};

function defaultQueryImpl(sql: string) {
  if (sql.includes("set_config")) return { rows: [], rowCount: 0 };
  if (sql.includes("FOR UPDATE")) return { rows: [{ ...PENDING_ROW }], rowCount: 1 };
  if (sql.includes("UPDATE driver_finance.cash_advance_requests")) {
    return { rows: [{ id: REQ_ID, status: sql.includes("'approved'") ? "approved" : "denied" }], rowCount: 1 };
  }
  if (sql.includes("FROM identity.users")) return { rows: [{ email: "manager@example.com" }], rowCount: 1 };
  if (sql.includes("FROM driver_finance.cash_advance_requests r")) return { rows: [], rowCount: 0 };
  return { rows: [], rowCount: 0 }; // audit inserts
}

function buildApp(role: string): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorateRequest("user", null);
  app.addHook("preHandler", async (req) => {
    req.user = { uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", role, email: "office@ih35.local" };
  });
  return registerDriverHubRequestRoutes(app).then(() => app.ready());
}

describe("driver-hub cash-advance request routes (DHUB-1 registration + gate)", () => {
  let app: FastifyInstance;

  beforeEach(() => {
    mockQuery.mockReset();
    mockQuery.mockImplementation(async (sql: string) => defaultQueryImpl(sql));
    mockRequireAuth.mockReset();
    mockRequireAuth.mockReturnValue(true);
    mockAssertMembership.mockReset();
    mockAssertMembership.mockResolvedValue(undefined);
    vi.mocked(appendCrudAudit).mockClear();
    vi.mocked(createSettlementDeduction).mockClear();
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  it("registers the endpoints — approve is reachable (not 404)", async () => {
    app = await buildApp("Manager");
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/cash-advances/hub/requests/${REQ_ID}/approve?operating_company_id=${OC}`,
      payload: {},
    });
    expect(res.statusCode).not.toBe(404);
    expect(res.statusCode).toBe(200);
  });

  it("role gate — non-manager (Driver) is forbidden (403) on approve", async () => {
    app = await buildApp("Driver");
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/cash-advances/hub/requests/${REQ_ID}/approve?operating_company_id=${OC}`,
      payload: {},
    });
    expect(res.statusCode).toBe(403);
    expect(createSettlementDeduction).not.toHaveBeenCalled();
  });

  it("role gate — Driver forbidden (403) on deny and pending list", async () => {
    app = await buildApp("Driver");
    const deny = await app.inject({
      method: "POST",
      url: `/api/v1/cash-advances/hub/requests/${REQ_ID}/deny?operating_company_id=${OC}`,
      payload: { denial_reason: "no" },
    });
    expect(deny.statusCode).toBe(403);
    const pending = await app.inject({
      method: "GET",
      url: `/api/v1/cash-advances/hub/requests/pending?operating_company_id=${OC}`,
    });
    expect(pending.statusCode).toBe(403);
  });

  it("approve persists status + audit through the shared service", async () => {
    app = await buildApp("Owner");
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/cash-advances/hub/requests/${REQ_ID}/approve?operating_company_id=${OC}`,
      payload: { approval_notes: "ok" },
    });
    expect(res.statusCode).toBe(200);
    expect(mockAssertMembership).toHaveBeenCalledWith("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", OC);
    expect(createSettlementDeduction).toHaveBeenCalledOnce();
    expect(appendCrudAudit).toHaveBeenCalledOnce();
    const approveUpdate = mockQuery.mock.calls.some(
      ([sql]) => String(sql).includes("UPDATE driver_finance.cash_advance_requests") && String(sql).includes("'approved'")
    );
    expect(approveUpdate).toBe(true);
  });

  it("deny persists status + audit and requires a reason", async () => {
    app = await buildApp("Administrator");
    const missing = await app.inject({
      method: "POST",
      url: `/api/v1/cash-advances/hub/requests/${REQ_ID}/deny?operating_company_id=${OC}`,
      payload: {},
    });
    expect(missing.statusCode).toBe(400); // denial_reason required

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/cash-advances/hub/requests/${REQ_ID}/deny?operating_company_id=${OC}`,
      payload: { denial_reason: "Outstanding balance too high" },
    });
    expect(res.statusCode).toBe(200);
    expect(appendCrudAudit).toHaveBeenCalledOnce();
    const denyUpdate = mockQuery.mock.calls.some(
      ([sql]) => String(sql).includes("UPDATE driver_finance.cash_advance_requests") && String(sql).includes("'denied'")
    );
    expect(denyUpdate).toBe(true);
  });
});
