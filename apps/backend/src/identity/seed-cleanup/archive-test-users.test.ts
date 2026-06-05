import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { registerIdentityRoutes } from "../users.routes.js";
import {
  isArchivedTestUserEmail,
  registerArchiveTestUsersRoutes,
} from "./archive-test-users.routes.js";

vi.mock("../../auth/db.js", () => ({
  withCurrentUser: vi.fn(async (_userId: string, fn: (client: { query: ReturnType<typeof vi.fn> }) => unknown) =>
    fn({
      query: vi.fn(async () => ({
        rows: [
          {
            id: "22222222-2222-4222-8222-222222222222",
            email: "integration.owner@test.invalid",
            role: "Owner",
            first_name: "Integration",
            last_name: "Owner",
            default_company_id: null,
            created_at: "2026-01-01T00:00:00.000Z",
            deactivated_at: "2026-01-01T00:00:00.000Z",
            archived_at: "2026-06-05T00:00:00.000Z",
            archived_reason: "seed_data_cleanup_p8_audit",
            last_login_at: null,
          },
        ],
      })),
    })
  ),
}));

vi.mock("../../auth/session-middleware.js", () => ({
  requireAuth: vi.fn(() => true),
}));

describe("archive test users seed cleanup (CLOSURE-8)", () => {
  it("detects archived test seed email patterns", () => {
    expect(isArchivedTestUserEmail("integration.owner@test.invalid")).toBe(true);
    expect(isArchivedTestUserEmail("jorge@ih35.com")).toBe(false);
  });

  it("GET /api/v1/identity/users accepts include_archived query when hook registered first", async () => {
    const app = Fastify();
    app.addHook("preHandler", async (req) => {
      req.user = { uuid: "11111111-1111-4111-8111-111111111111", role: "Owner" };
    });

    await registerArchiveTestUsersRoutes(app);
    await registerIdentityRoutes(app);

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/identity/users?include_archived=true",
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("users");
  });
});
