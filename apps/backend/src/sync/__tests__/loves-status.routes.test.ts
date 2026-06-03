import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

const fetchStatusMock = vi.fn();
const requireAuthState = { allowed: true };

vi.mock("../../auth/session-middleware.js", () => ({
  requireAuth: (_req: unknown, reply: { code: (statusCode: number) => { send: (body: unknown) => void } }) => {
    if (requireAuthState.allowed) return true;
    reply.code(401).send({ error: "unauthorized" });
    return false;
  },
}));

vi.mock("../loves-card-import.js", () => ({
  fetchLovesSyncStatus: (...args: unknown[]) => fetchStatusMock(...args),
}));

import { registerLovesSyncStatusRoutes } from "../loves-status.routes.js";

describe("GET /api/v1/sync/loves/status", () => {
  afterEach(() => {
    fetchStatusMock.mockReset();
    requireAuthState.allowed = true;
  });

  it("returns ISO timestamp payload", async () => {
    fetchStatusMock.mockResolvedValue({
      last_synced_at: "2026-06-03T10:15:00.000Z",
      rows_imported_24h: 42,
      status: "ok",
    });

    const app = Fastify();
    app.addHook("preHandler", async (req) => {
      req.user = { uuid: "00000000-0000-4000-8000-000000000099", role: "Owner", email: null };
    });
    await registerLovesSyncStatusRoutes(app);

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/sync/loves/status?operating_company_id=00000000-0000-4000-8000-000000000001",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      last_synced_at: string;
      rows_imported_24h: number;
      status: string;
    };
    expect(body.last_synced_at).toBe("2026-06-03T10:15:00.000Z");
    expect(body.rows_imported_24h).toBe(42);
    expect(body.status).toBe("ok");
    expect(Number.isNaN(Date.parse(body.last_synced_at))).toBe(false);
    await app.close();
  });
});
