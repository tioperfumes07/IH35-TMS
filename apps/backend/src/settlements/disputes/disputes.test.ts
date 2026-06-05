import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  withCurrentUserMock: vi.fn(),
  requireAuthMock: vi.fn(),
  createCorrectiveJournalEntryMock: vi.fn(),
  appendCrudAuditMock: vi.fn(),
}));

vi.mock("../../auth/db.js", () => ({
  withCurrentUser: mocked.withCurrentUserMock,
}));

vi.mock("../../auth/session-middleware.js", () => ({
  requireAuth: mocked.requireAuthMock,
}));

vi.mock("../../driver-finance/settlement-dispute.service.js", () => ({
  createCorrectiveJournalEntry: mocked.createCorrectiveJournalEntryMock,
}));

vi.mock("../../audit/crud-audit.js", () => ({
  appendCrudAudit: mocked.appendCrudAuditMock,
}));

import { registerSettlementsDisputesRoutes } from "./disputes.routes.js";

describe("settlements disputes routes (CLOSURE-5)", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    mocked.withCurrentUserMock.mockReset();
    mocked.requireAuthMock.mockReset();
    mocked.createCorrectiveJournalEntryMock.mockReset();
    mocked.appendCrudAuditMock.mockReset();
    mocked.requireAuthMock.mockReturnValue(true);
    mocked.withCurrentUserMock.mockImplementation(async (_userId: string, fn: (client: unknown) => Promise<unknown>) =>
      fn({ query: vi.fn().mockResolvedValue({ rows: [{ id: "dispute-1" }] }) })
    );

    app = Fastify({ logger: false });
    app.decorateRequest("user", null);
    app.addHook("preHandler", async (req) => {
      req.user = { uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", role: "Owner", email: "owner@ih35.local" };
    });
    await registerSettlementsDisputesRoutes(app);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("accepts evidence_doc_ids on create dispute", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/settlements/91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6073/disputes",
      payload: {
        operating_company_id: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071",
        driver_id: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6072",
        dispute_type: "missing_line",
        claimed_amount_cents: 50000,
        description: "Missing detention line on settlement",
        evidence_doc_ids: ["91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6099"],
      },
    });
    expect(res.statusCode).toBe(201);
  });

  it("returns E_OWNER_ONLY for non-owner review", async () => {
    const ownerOnlyApp = Fastify({ logger: false });
    ownerOnlyApp.decorateRequest("user", null);
    ownerOnlyApp.addHook("preHandler", async (req) => {
      req.user = { uuid: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", role: "Accountant", email: "acct@ih35.local" };
    });
    mocked.withCurrentUserMock.mockImplementationOnce(async () => {
      throw new Error("E_OWNER_ONLY");
    });
    await registerSettlementsDisputesRoutes(ownerOnlyApp);
    await ownerOnlyApp.ready();

    const res = await ownerOnlyApp.inject({
      method: "PATCH",
      url: "/api/v1/settlement-disputes/91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6088/review",
      payload: {
        operating_company_id: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071",
        status: "approved",
        resolution_amount_cents: 50000,
        resolution_notes: "Approved after document review",
      },
    });
    expect(res.statusCode).toBe(403);
    await ownerOnlyApp.close();
  });
});
