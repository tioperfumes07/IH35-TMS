import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// H2-3 follow-up: routes.ts no longer calls `lucia.invalidateSession` directly on
// logout — it goes through the session-provider seam (`invalidateSession` in
// ./session-provider.ts), a 1:1 pass-through added so a future swap off Lucia is a
// localized change. scripts/sec-audit-auth-flows.mjs previously only recognized the
// direct `lucia.invalidateSession` call and false-failed once the seam landed
// (PR #2130). This test proves, at RUNTIME (not by static grep), that hitting the
// real logout route still invalidates the real Lucia session through the seam —
// closing the "guard can't see through the indirection" gap for good, independent
// of how the static guard's pattern-matching evolves.
import { lucia } from "../lucia.js";
import { registerAuthRoutes } from "../routes.js";

describe("POST /api/v1/auth/logout — server-side session invalidation (H2-3 seam)", () => {
  let invalidateSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    invalidateSpy = vi.spyOn(lucia, "invalidateSession").mockResolvedValue(undefined as never);
  });

  afterEach(() => {
    invalidateSpy.mockRestore();
  });

  async function build() {
    const app = Fastify({ logger: false });
    await app.register(cookie);
    await registerAuthRoutes(app);
    await app.ready();
    return app;
  }

  it("invalidates the real Lucia session for the cookie's session id, through the session-provider seam", async () => {
    const app = await build();
    try {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/logout",
        headers: { cookie: "ih35_session=test-session-id-123" },
      });

      // The seam is a 1:1 pass-through: calling it MUST reach the real lucia.invalidateSession.
      expect(invalidateSpy).toHaveBeenCalledTimes(1);
      expect(invalidateSpy).toHaveBeenCalledWith("test-session-id-123");

      // And the cookie must still be cleared client-side.
      const setCookieHeader = res.headers["set-cookie"];
      const cookies = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
      expect(cookies.some((c) => typeof c === "string" && c.startsWith("ih35_session=;"))).toBe(true);
    } finally {
      await app.close();
    }
  });

  it("does not blow up when there is no session cookie, and does not attempt invalidation", async () => {
    const app = await build();
    try {
      const res = await app.inject({ method: "POST", url: "/api/v1/auth/logout" });
      expect(res.statusCode).toBeLessThan(500);
      expect(invalidateSpy).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});
