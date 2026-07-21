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

type QueryCall = { sql: string; values: unknown[] };

describe("settlements disputes routes (CLOSURE-5 → P2e canonical convergence)", () => {
  let app: FastifyInstance;
  let calls: QueryCall[];

  beforeEach(async () => {
    mocked.withCurrentUserMock.mockReset();
    mocked.requireAuthMock.mockReset();
    mocked.createCorrectiveJournalEntryMock.mockReset();
    mocked.appendCrudAuditMock.mockReset();
    mocked.requireAuthMock.mockReturnValue(true);
    calls = [];
    mocked.withCurrentUserMock.mockImplementation(async (_userId: string, fn: (client: unknown) => Promise<unknown>) =>
      fn({
        query: vi.fn().mockImplementation(async (sql: string, values: unknown[] = []) => {
          calls.push({ sql, values });
          return { rows: [{ id: "dispute-1", driver_id: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6072" }] };
        }),
      })
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

  it("creates disputes in the canonical driver_finance table with mapped category + preserved legacy type + evidence", async () => {
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

    const insert = calls.find((c) => /INSERT INTO driver_finance\.driver_settlement_disputes/i.test(c.sql));
    expect(insert).toBeDefined();
    // No SQL may touch the RETIRE table.
    expect(calls.some((c) => /settlements\.settlement_disputes/i.test(c.sql))).toBe(false);
    // missing_line → canonical missing_pay, original preserved in legacy_dispute_type.
    expect(insert!.values).toContain("missing_pay");
    expect(insert!.values).toContain("missing_line");
    // Evidence array passes through.
    expect(insert!.values).toContainEqual(["91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6099"]);
  });

  it("rejects descriptions under the canonical 20-char minimum", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/settlements/91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6073/disputes",
      payload: {
        operating_company_id: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071",
        driver_id: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6072",
        dispute_type: "other",
        claimed_amount_cents: 100,
        description: "too short here",
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("lists from the canonical table and maps status filter + response statuses to the plural vocabulary", async () => {
    mocked.withCurrentUserMock.mockImplementationOnce(async (_userId: string, fn: (client: unknown) => Promise<unknown>) =>
      fn({
        query: vi.fn().mockImplementation(async (sql: string, values: unknown[] = []) => {
          calls.push({ sql, values });
          if (/COUNT\(\*\)/i.test(sql)) return { rows: [{ total: "1" }] };
          if (/FROM driver_finance\.driver_settlement_disputes/i.test(sql)) {
            return { rows: [{ id: "dispute-1", status: "under_review", dispute_type: "incorrect_rate" }] };
          }
          return { rows: [] };
        }),
      })
    );

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/settlement-disputes?operating_company_id=91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071&status=in_review",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { disputes: Array<{ status: string }>; total: number };
    // canonical under_review → plural in_review on the wire.
    expect(body.disputes[0]?.status).toBe("in_review");
    expect(body.total).toBe(1);
    // Filter param was mapped plural → canonical before hitting SQL.
    const listCall = calls.find((c) => /FROM driver_finance\.driver_settlement_disputes/i.test(c.sql) && !/COUNT/i.test(c.sql));
    expect(listCall!.values).toContain("under_review");
    expect(calls.some((c) => /settlements\.settlement_disputes/i.test(c.sql))).toBe(false);
  });

  it("review approve writes canonical resolved_in_favor + settlement line + corrective JE", async () => {
    mocked.createCorrectiveJournalEntryMock.mockResolvedValue("je-1");
    mocked.withCurrentUserMock.mockImplementationOnce(async (_userId: string, fn: (client: unknown) => Promise<unknown>) =>
      fn({
        query: vi.fn().mockImplementation(async (sql: string, values: unknown[] = []) => {
          calls.push({ sql, values });
          if (/FOR UPDATE/i.test(sql)) {
            return {
              rows: [
                {
                  id: "dispute-1",
                  settlement_id: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6073",
                  driver_id: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6072",
                  status: "open",
                  claimed_amount_cents: 50000,
                },
              ],
            };
          }
          return { rows: [] };
        }),
      })
    );

    const res = await app.inject({
      method: "PATCH",
      url: "/api/v1/settlement-disputes/91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6088/review",
      payload: {
        operating_company_id: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071",
        status: "approved",
        resolution_amount_cents: 50000,
        resolution_notes: "Approved after document review",
      },
    });
    expect(res.statusCode).toBe(200);
    expect(mocked.createCorrectiveJournalEntryMock).toHaveBeenCalledTimes(1);

    const lockRead = calls.find((c) => /FOR UPDATE/i.test(c.sql));
    expect(lockRead!.sql).toMatch(/FROM driver_finance\.driver_settlement_disputes/i);
    const update = calls.find((c) => /UPDATE driver_finance\.driver_settlement_disputes/i.test(c.sql) && /closed_at/i.test(c.sql));
    expect(update).toBeDefined();
    expect(update!.values).toContain("resolved_in_favor");
    const lineInsert = calls.find((c) => /INSERT INTO driver_finance\.settlement_lines/i.test(c.sql));
    expect(lineInsert).toBeDefined();
    // cents → dollars for settlement_lines.amount
    expect(lineInsert!.values).toContain(500);
    expect(calls.some((c) => /settlements\.settlement_disputes/i.test(c.sql))).toBe(false);
  });

  it("returns E_OWNER_ONLY for non-owner review", async () => {
    const ownerOnlyApp = Fastify({ logger: false });
    ownerOnlyApp.decorateRequest("user", null);
    ownerOnlyApp.addHook("preHandler", async (req) => {
      req.user = { uuid: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", role: "Accountant", email: "acct@ih35.local" };
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

  it("blocks re-review of a closed dispute (E_CLOSED_IMMUTABLE)", async () => {
    mocked.withCurrentUserMock.mockImplementationOnce(async (_userId: string, fn: (client: unknown) => Promise<unknown>) =>
      fn({
        query: vi.fn().mockImplementation(async (sql: string) => {
          calls.push({ sql, values: [] });
          if (/FOR UPDATE/i.test(sql)) {
            return { rows: [{ id: "dispute-1", settlement_id: "s-1", driver_id: "d-1", status: "resolved_in_favor", claimed_amount_cents: 100 }] };
          }
          return { rows: [] };
        }),
      })
    );

    const res = await app.inject({
      method: "PATCH",
      url: "/api/v1/settlement-disputes/91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6088/review",
      payload: {
        operating_company_id: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071",
        status: "denied",
        resolution_notes: "Denied after document review",
      },
    });
    expect(res.statusCode).toBe(409);
  });
});
