import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { registerPreFlightDvirRoutes } from "./pre-flight-dvir.routes.js";

const DEFECT = "2ad9470f-57e2-4336-9648-4432f23c4da3";
const COMPANY = "91e0bf0a-133f-4ce8-a734-2586cfa66d96";

function withAuth() {
  const app = Fastify();
  app.addHook("preHandler", async (req) => {
    req.user = { uuid: "00000000-0000-0000-0000-0000000000aa", email: null, role: "Owner" };
    req.session = { id: "test-session" };
  });
  return app;
}

describe("registerPreFlightDvirRoutes", () => {
  it("GET /queue EXISTS and is auth-gated (401, not 404) when unauthenticated", async () => {
    const app = Fastify();
    await registerPreFlightDvirRoutes(app);
    await app.ready();
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/maintenance/pre-flight-dvir/queue?operating_company_id=${COMPANY}`,
    });
    expect(res.statusCode).toBe(401);
    expect(res.statusCode).not.toBe(404);
    await app.close();
  });

  it("POST /:id/route EXISTS and is auth-gated (401, not 404) when unauthenticated", async () => {
    const app = Fastify();
    await registerPreFlightDvirRoutes(app);
    await app.ready();
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/maintenance/pre-flight-dvir/${DEFECT}/route`,
      payload: { operating_company_id: COMPANY },
    });
    expect(res.statusCode).toBe(401);
    expect(res.statusCode).not.toBe(404);
    await app.close();
  });

  it("PATCH /:id/severity EXISTS and is auth-gated (401, not 404) when unauthenticated", async () => {
    const app = Fastify();
    await registerPreFlightDvirRoutes(app);
    await app.ready();
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/maintenance/pre-flight-dvir/${DEFECT}/severity`,
      payload: { operating_company_id: COMPANY, severity: "major" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.statusCode).not.toBe(404);
    await app.close();
  });

  it("GET /queue rejects a missing operating_company_id with 400 (validation before DB)", async () => {
    const app = withAuth();
    await registerPreFlightDvirRoutes(app);
    await app.ready();
    const res = await app.inject({ method: "GET", url: `/api/v1/maintenance/pre-flight-dvir/queue` });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("PATCH /:id/severity rejects an invalid severity value with 400", async () => {
    const app = withAuth();
    await registerPreFlightDvirRoutes(app);
    await app.ready();
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/maintenance/pre-flight-dvir/${DEFECT}/severity`,
      payload: { operating_company_id: COMPANY, severity: "catastrophic" },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
