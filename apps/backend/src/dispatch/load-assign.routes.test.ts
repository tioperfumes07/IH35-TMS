import Fastify from "fastify";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { registerDispatchLoadAssignRoutes } from "./load-assign.routes.js";

const DRIVER = "2ad9470f-57e2-4336-9648-4432f23c4da3";
const COMPANY = "91e0bf0a-133f-4ce8-a734-2586cfa66d96";

function withAuth() {
  const app = Fastify();
  app.addHook("preHandler", async (req) => {
    req.user = { uuid: "00000000-0000-0000-0000-0000000000aa", email: null, role: "Owner" };
    req.session = { id: "test-session" };
  });
  return app;
}

describe("registerDispatchLoadAssignRoutes", () => {
  // DRV-AVAILABILITY-RLS-MASKED: the quick-assign interlock hook used to run at "preValidation" —
  // BEFORE session-middleware's own "preHandler" auth hook populates req.user — so it could never
  // have seen an authenticated user even in production. Asserting the real source (not the mocked
  // Fastify instance above, which injects req.user at preHandler regardless of phase and would not
  // catch this regression) is the only way to lock the hook phase in place.
  it("DRV-AVAILABILITY-RLS-MASKED: the quick-assign interlock hook runs at preHandler, not preValidation", () => {
    const src = readFileSync(fileURLToPath(new URL("./load-assign.routes.ts", import.meta.url)), "utf8");
    expect(src).toMatch(/app\.addHook\("preHandler",/);
    expect(src).not.toMatch(/app\.addHook\("preValidation",/);
  });

  // Same fix: both handlers must scope canAssignLoadToDriver through a real per-user connection
  // (withCompanyScope), never call it bare. canAssignLoadToDriver's own `queryable` parameter is
  // required (not optional) precisely so a caller that forgets this fails to COMPILE.
  it("DRV-AVAILABILITY-RLS-MASKED: both call sites scope canAssignLoadToDriver via withCompanyScope", () => {
    const src = readFileSync(fileURLToPath(new URL("./load-assign.routes.ts", import.meta.url)), "utf8");
    const calls = [...src.matchAll(/canAssignLoadToDriver\(/g)];
    expect(calls.length).toBe(2);
    expect(src).toMatch(/withCompanyScope\(authUser\.uuid, tenantId, \(client\) =>\s*\n\s*canAssignLoadToDriver/g);
    expect((src.match(/withCompanyScope\(/g) ?? []).length).toBe(2);
  });

  it("load-availability GET is auth-gated (401, not 404) when unauthenticated", async () => {
    const app = Fastify();
    await registerDispatchLoadAssignRoutes(app);
    await app.ready();
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/dispatch/drivers/${DRIVER}/load-availability?operating_company_id=${COMPANY}`,
    });
    expect(res.statusCode).toBe(401);
    expect(res.statusCode).not.toBe(404);
    await app.close();
  });

  it("load-availability GET rejects a non-uuid driver_id with 400 (validation before DB)", async () => {
    const app = withAuth();
    await registerDispatchLoadAssignRoutes(app);
    await app.ready();
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/dispatch/drivers/not-a-uuid/load-availability?operating_company_id=${COMPANY}`,
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("quick-assign interlock is auth-gated (401, not a silent pass-through) when unauthenticated", async () => {
    const app = Fastify();
    app.post("/api/v1/dispatch/loads/:id/quick-assign", async () => ({ ok: true }));
    await registerDispatchLoadAssignRoutes(app);
    await app.ready();
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/dispatch/loads/load-1/quick-assign`,
      payload: { driver_id: DRIVER, operating_company_id: COMPANY },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("quick-assign interlock rejects a non-uuid driver_id with 400 (validation before DB)", async () => {
    const app = withAuth();
    app.post("/api/v1/dispatch/loads/:id/quick-assign", async () => ({ ok: true }));
    await registerDispatchLoadAssignRoutes(app);
    await app.ready();
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/dispatch/loads/load-1/quick-assign`,
      payload: { driver_id: "not-a-uuid", operating_company_id: COMPANY },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
