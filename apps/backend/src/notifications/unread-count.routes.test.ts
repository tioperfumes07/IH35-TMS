import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerNotificationUnreadCountRoutes } from "./unread-count.routes.js";

const mockQuery = vi.fn();

vi.mock("../auth/db.js", () => ({
  withCurrentUser: async (_userId: string, fn: (client: { query: typeof mockQuery }) => Promise<unknown>) =>
    fn({ query: mockQuery }),
}));

const mockRequireAuth = vi.fn(() => true);

vi.mock("../auth/session-middleware.js", () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}));

describe("notification unread-count routes (AUDIT-FIX-9)", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    mockQuery.mockReset();
    mockRequireAuth.mockReset();
    mockRequireAuth.mockReturnValue(true);
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("to_regclass('notifications.user_notifications')")) {
        return { rows: [{ ok: true }] };
      }
      return { rows: [{ count: "3" }] };
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
    await registerNotificationUnreadCountRoutes(app);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns unread count with 200", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/notifications/unread-count" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ unread_count: 3 });
  });

  it("degrades to zero when notifications schema is missing", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("to_regclass('notifications.user_notifications')")) {
        return { rows: [{ ok: false }] };
      }
      throw new Error("relation notifications.user_notifications does not exist");
    });

    const res = await app.inject({ method: "GET", url: "/api/v1/notifications/unread-count" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ unread_count: 0 });
  });
});
