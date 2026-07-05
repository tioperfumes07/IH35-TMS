import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { registerDriverDispatchEligibilityRoutes } from "./driver-eligibility.routes.js";

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

describe("registerDriverDispatchEligibilityRoutes", () => {
  it("the route EXISTS and is auth-gated (401, not 404) when unauthenticated", async () => {
    const app = Fastify();
    await registerDriverDispatchEligibilityRoutes(app);
    await app.ready();
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/dispatch/drivers/${DRIVER}/eligibility?operating_company_id=${COMPANY}`,
    });
    expect(res.statusCode).toBe(401);
    expect(res.statusCode).not.toBe(404);
    await app.close();
  });

  it("rejects a missing operating_company_id with 400 (validation before DB)", async () => {
    const app = withAuth();
    await registerDriverDispatchEligibilityRoutes(app);
    await app.ready();
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/dispatch/drivers/${DRIVER}/eligibility`,
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("rejects a non-uuid driverId with 400", async () => {
    const app = withAuth();
    await registerDriverDispatchEligibilityRoutes(app);
    await app.ready();
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/dispatch/drivers/not-a-uuid/eligibility?operating_company_id=${COMPANY}`,
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
