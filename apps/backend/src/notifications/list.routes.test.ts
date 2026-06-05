import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerNotificationListRoutes } from "./list.routes.js";

const mockQuery = vi.fn();

vi.mock("../auth/db.js", () => ({
  withCurrentUser: async (_userId: string, fn: (client: { query: typeof mockQuery }) => Promise<unknown>) =>
    fn({ query: mockQuery }),
}));

const mockRequireAuth = vi.fn(() => true);

vi.mock("../auth/session-middleware.js", () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}));

describe("notification list routes (AUDIT-FIX-9)", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    mockQuery.mockReset();
    mockRequireAuth.mockReset();
    mockRequireAuth.mockReturnValue(true);
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("to_regclass('notifications.user_notifications')")) {
        return { rows: [{ ok: true }] };
      }
      return {
        rows: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            type: "system",
            severity: "info",
            title: "Test",
            body: null,
            action_link: null,
            entity_type: null,
            entity_id: null,
            source_block: null,
            read_at: null,
            dismissed_at: null,
            created_at: "2026-06-04T12:00:00.000Z",
          },
        ],
      };
    });

    app = Fastify({ logger: false });
    app.decorateRequest("user", null);
    app.addHook("preHandler", async (req) => {
      req.user = {
        uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        role: "Manager",
        email: "office@ih35.local",
      };
    });
    await registerNotificationListRoutes(app);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns notifications list with 200", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/notifications?limit=20" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { notifications: unknown[] };
    expect(body.notifications).toHaveLength(1);
  });

  it("degrades to empty list when notifications schema is missing", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("to_regclass('notifications.user_notifications')")) {
        return { rows: [{ ok: false }] };
      }
      throw new Error("relation notifications.user_notifications does not exist");
    });

    const res = await app.inject({ method: "GET", url: "/api/v1/notifications?limit=20" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ notifications: [] });
  });
});
