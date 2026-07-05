import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// SETTLE-3 — endpoint-level coverage for the office settlement-dispute routes. Proves the routes are
// reachable (no 404 — the exact regression this block fixes), that the money-affecting review/resolve
// verbs are Owner/Admin gated, and that opening a dispute persists + writes an audit row.
const mocked = vi.hoisted(() => ({
  withCurrentUserMock: vi.fn(),
  requireAuthMock: vi.fn(),
  appendCrudAuditMock: vi.fn(),
  createJournalEntryMock: vi.fn(),
}));

vi.mock("../auth/db.js", () => ({
  withCurrentUser: mocked.withCurrentUserMock,
}));

vi.mock("../auth/session-middleware.js", () => ({
  requireAuth: mocked.requireAuthMock,
}));

vi.mock("../audit/crud-audit.js", () => ({
  appendCrudAudit: mocked.appendCrudAuditMock,
}));

vi.mock("../accounting/journal-entries.service.js", () => ({
  createJournalEntry: mocked.createJournalEntryMock,
}));

import { registerSettlementDisputeRoutes } from "./settlement-dispute.routes.js";

const OCID = "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071";
const SETTLEMENT_ID = "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6072";
const DRIVER_ID = "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6073";
const DISPUTE_ID = "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6088";

function buildApp(user: { uuid: string; role: string; email: string }) {
  const app = Fastify({ logger: false });
  app.decorateRequest("user", null);
  app.addHook("preHandler", async (req) => {
    (req as unknown as { user: typeof user }).user = user;
  });
  return app;
}

// Every mdata/driver_finance query in the service tolerates a single fake row shape.
function fakeClient() {
  return { query: vi.fn().mockResolvedValue({ rows: [{ id: DISPUTE_ID }], rowCount: 1 }) };
}

describe("office settlement-dispute routes (SETTLE-3)", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    mocked.withCurrentUserMock.mockReset();
    mocked.requireAuthMock.mockReset();
    mocked.appendCrudAuditMock.mockReset();
    mocked.createJournalEntryMock.mockReset();

    mocked.requireAuthMock.mockReturnValue(true);
    mocked.appendCrudAuditMock.mockResolvedValue(undefined);
    mocked.withCurrentUserMock.mockImplementation(
      async (_userId: string, fn: (client: unknown) => Promise<unknown>) => fn(fakeClient())
    );

    app = buildApp({ uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", role: "Owner", email: "owner@ih35.local" });
    await registerSettlementDisputeRoutes(app);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("GET list endpoint is reachable (not 404) and returns disputes for an authed user", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/driver-finance/settlement-disputes?operating_company_id=${OCID}&status=open`,
    });
    expect(res.statusCode).not.toBe(404);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty("disputes");
  });

  it("POST create persists the dispute and writes an audit row", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/driver-finance/settlement-disputes",
      payload: {
        operating_company_id: OCID,
        settlement_id: SETTLEMENT_ID,
        driver_id: DRIVER_ID,
        dispute_category: "missing_pay",
        dispute_description: "Detention pay was omitted from this weekly settlement run",
      },
    });
    expect(res.statusCode).toBe(201);
    // persisted via the transactional service
    expect(mocked.withCurrentUserMock).toHaveBeenCalled();
    // audit spine: dispute.opened is appended
    const auditActions = mocked.appendCrudAuditMock.mock.calls.map((c) => c[2]);
    expect(auditActions).toContain("driver_finance.dispute.opened");
  });

  it("GET detail endpoint is reachable (not 404)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/driver-finance/settlement-disputes/${DISPUTE_ID}?operating_company_id=${OCID}`,
    });
    expect(res.statusCode).not.toBe(404);
  });

  it("POST review as Owner is reachable (not 404, not 403)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/driver-finance/settlement-disputes/${DISPUTE_ID}/review`,
      payload: { operating_company_id: OCID },
    });
    expect(res.statusCode).not.toBe(404);
    expect(res.statusCode).not.toBe(403);
  });

  it("POST resolve as Owner is reachable (not 404, not 403)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/driver-finance/settlement-disputes/${DISPUTE_ID}/resolve`,
      payload: {
        operating_company_id: OCID,
        resolution: "rejected",
        resolution_notes: "Reviewed the deduction ledger; the settlement figures are correct as posted.",
      },
    });
    expect(res.statusCode).not.toBe(404);
    expect(res.statusCode).not.toBe(403);
  });

  it("review is Owner/Admin gated — a non-privileged role gets 403 (driver pay is protected)", async () => {
    const acctApp = buildApp({ uuid: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", role: "Accountant", email: "acct@ih35.local" });
    await registerSettlementDisputeRoutes(acctApp);
    await acctApp.ready();
    const res = await acctApp.inject({
      method: "POST",
      url: `/api/v1/driver-finance/settlement-disputes/${DISPUTE_ID}/review`,
      payload: { operating_company_id: OCID },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: "E_OWNER_OR_ADMIN_ONLY" });
    await acctApp.close();
  });

  it("resolve is Owner/Admin gated — a non-privileged role gets 403", async () => {
    const acctApp = buildApp({ uuid: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", role: "Dispatcher", email: "disp@ih35.local" });
    await registerSettlementDisputeRoutes(acctApp);
    await acctApp.ready();
    const res = await acctApp.inject({
      method: "POST",
      url: `/api/v1/driver-finance/settlement-disputes/${DISPUTE_ID}/resolve`,
      payload: {
        operating_company_id: OCID,
        resolution: "in_favor",
        resolution_amount_cents: 5000,
        resolution_notes: "Adjustment approved after reviewing supporting detention documentation.",
      },
    });
    expect(res.statusCode).toBe(403);
    await acctApp.close();
  });

  it("withdraw is Driver-only — a non-driver role gets 403", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/driver-finance/settlement-disputes/${DISPUTE_ID}/withdraw`,
      payload: { operating_company_id: OCID },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: "E_DRIVER_ONLY_WITHDRAW" });
  });
});
