import Fastify from "fastify";
import { afterAll, describe, expect, it } from "vitest";
import { registerAdminClientErrorRoutes } from "./client-errors.routes.js";

describe("admin client-errors routes", () => {
  it("registers POST /api/v1/admin/client-errors exactly once (single registerAdminClientErrorRoutes build)", async () => {
    const app = Fastify({ logger: false });
    await registerAdminClientErrorRoutes(app);
    await app.ready();
    const lines = app
      .printRoutes({ commonPrefix: false })
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const hits = lines.filter((l) => l.includes("admin/client-errors") && l.includes("(POST"));
    expect(hits.length).toBe(1);
    await app.close();
  });

  it("throws Fastify duplicate-route error if admin client-errors route is registered twice", async () => {
    const app = Fastify({ logger: false });
    await registerAdminClientErrorRoutes(app);
    await expect(registerAdminClientErrorRoutes(app)).rejects.toThrow(/already declared/i);
    await app.close();
  });
});
