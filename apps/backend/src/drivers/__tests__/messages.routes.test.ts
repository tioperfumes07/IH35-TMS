import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerDriversMessagesRoutes } from "../messages.routes.js";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const DRIVER = "22222222-2222-4222-8222-222222222222";
const MESSAGE = "33333333-3333-4333-8333-333333333333";

const { mockQuery, mockWithCurrentUser, mockAppendCrudAudit, mockRequireDriverSession } = vi.hoisted(() => {
  const query = vi.fn();
  const withCurrentUser = vi.fn(async (_userId: string, fn: (client: { query: typeof query }) => Promise<unknown>) =>
    fn({ query })
  );
  const appendCrudAudit = vi.fn(async () => undefined);
  const requireDriverSession = vi.fn(async () => true);
  return { mockQuery: query, mockWithCurrentUser: withCurrentUser, mockAppendCrudAudit: appendCrudAudit, mockRequireDriverSession: requireDriverSession };
});

vi.mock("../../auth/db.js", () => ({
  withCurrentUser: mockWithCurrentUser,
}));

// Cross-tenant guard: exercised in dedicated membership tests; here it is a no-op so route logic (not membership) is under test.
vi.mock("../../_helpers/company-membership-guard.js", () => ({
  assertCompanyMembership: vi.fn(async () => undefined),
}));


vi.mock("../../auth/session-middleware.js", () => ({
  requireAuth: () => true,
}));

vi.mock("../../audit/crud-audit.js", () => ({
  appendCrudAudit: mockAppendCrudAudit,
}));

vi.mock("../../driver/auth.js", () => ({
  requireDriverSession: mockRequireDriverSession,
}));

vi.mock("../messages.service.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../messages.service.js")>();
  return {
    ...actual,
    deliverDriverProfileMessage: vi.fn(async () => ({ delivery_status: "delivered", delivery_ref: null })),
  };
});

function mockDbQuery() {
  return vi.fn(async (sql: string) => {
    if (sql.includes("set_config")) return { rows: [], rowCount: 0 };
    return { rows: [], rowCount: 0 };
  });
}

describe("drivers messages routes (A24-10)", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    mockQuery.mockReset();
    mockQuery.mockImplementation(mockDbQuery());
    mockAppendCrudAudit.mockClear();
    mockRequireDriverSession.mockResolvedValue(true);
    app = Fastify({ logger: false });
    app.decorateRequest("user", null);
    app.decorateRequest("driver", null);
    app.addHook("preHandler", async (req) => {
      req.user = {
        uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        role: "Manager",
        email: "office@ih35.local",
      };
      req.driver = {
        id: DRIVER,
        full_name: "Test Driver",
        status: "Active",
        preferred_language: "en",
      };
    });
    await registerDriversMessagesRoutes(app);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("GET /api/v1/drivers/messages/inbox returns conversations", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("set_config")) return { rows: [], rowCount: 0 };
      if (sql.includes("latest_message")) {
        return {
          rows: [
            {
              driver_id: DRIVER,
              driver_name: "Test Driver",
              latest_message: "Hello",
              latest_at: "2026-06-04T12:00:00Z",
              latest_channel: "in_app",
              unread_count: 1,
            },
          ],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/drivers/messages/inbox?operating_company_id=${COMPANY}`,
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).conversations).toHaveLength(1);
  });

  it("GET /api/v1/drivers/messages/unread returns unread messages", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("set_config")) return { rows: [], rowCount: 0 };
      if (sql.includes("m.read_at IS NULL")) {
        return {
          rows: [
            {
              id: MESSAGE,
              operating_company_id: COMPANY,
              driver_id: DRIVER,
              message: "Need ETA",
              channel: "in_app",
              urgency: null,
              created_by: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
              created_at: "2026-06-04T12:00:00Z",
              read_at: null,
              read_by: null,
              delivery_status: "delivered",
              delivery_ref: null,
              identity_user_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
              driver_name: "Test Driver",
            },
          ],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/drivers/messages/unread?operating_company_id=${COMPANY}`,
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).unread_count).toBe(1);
  });

  it("GET /api/v1/drivers/messages/:driverId/thread returns thread", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("set_config")) return { rows: [], rowCount: 0 };
      if (sql.includes("ORDER BY m.created_at ASC")) {
        return {
          rows: [
            {
              id: MESSAGE,
              operating_company_id: COMPANY,
              driver_id: DRIVER,
              message: "Hello",
              channel: "in_app",
              urgency: null,
              created_by: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
              created_at: "2026-06-04T12:00:00Z",
              read_at: null,
              read_by: null,
              delivery_status: "delivered",
              delivery_ref: null,
              identity_user_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
              driver_name: "Test Driver",
            },
          ],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/drivers/messages/${DRIVER}/thread?operating_company_id=${COMPANY}`,
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).messages).toHaveLength(1);
  });

  it("PATCH /api/v1/drivers/messages/:messageId/read marks message read", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("set_config")) return { rows: [], rowCount: 0 };
      if (sql.includes("UPDATE mdata.driver_profile_messages")) {
        return {
          rows: [
            {
              id: MESSAGE,
              operating_company_id: COMPANY,
              driver_id: DRIVER,
              message: "Hello",
              channel: "in_app",
              urgency: null,
              created_by: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
              created_at: "2026-06-04T12:00:00Z",
              read_at: "2026-06-04T12:05:00Z",
              read_by: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
              delivery_status: "delivered",
              delivery_ref: null,
              identity_user_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
              driver_name: "Test Driver",
            },
          ],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    });

    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/drivers/messages/${MESSAGE}/read?operating_company_id=${COMPANY}`,
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).message.read_at).toBeTruthy();
    expect(mockAppendCrudAudit).toHaveBeenCalled();
  });

  it("GET /api/v1/driver/messages returns driver PWA inbox", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("operating_company_id::text FROM mdata.drivers")) {
        return { rows: [{ operating_company_id: COMPANY }], rowCount: 1 };
      }
      if (sql.includes("set_config")) return { rows: [], rowCount: 0 };
      if (sql.includes("ORDER BY m.created_at ASC")) {
        return {
          rows: [
            {
              id: MESSAGE,
              operating_company_id: COMPANY,
              driver_id: DRIVER,
              message: "Office note",
              channel: "in_app",
              urgency: null,
              created_by: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
              created_at: "2026-06-04T12:00:00Z",
              read_at: null,
              read_by: null,
              delivery_status: "delivered",
              delivery_ref: null,
              identity_user_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
              driver_name: "Test Driver",
            },
          ],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    });

    const res = await app.inject({ method: "GET", url: "/api/v1/driver/messages" });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).messages).toHaveLength(1);
  });
});
