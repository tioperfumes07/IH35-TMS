import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerInsuranceLawsuitRoutes } from "./lawsuit.routes.js";

const requireAuthState = { allowed: true };

vi.mock("../auth/session-middleware.js", () => ({
  requireAuth: (req: { user?: unknown }, reply: { code: (statusCode: number) => { send: (body: unknown) => void } }) => {
    if (requireAuthState.allowed) { req.user = { uuid: "u-1" }; return true; }
    reply.code(401).send({ error: "unauthorized" });
    return false;
  },
}));

describe("insurance lawsuit routes", () => {
  const apps: Array<ReturnType<typeof Fastify>> = [];

  beforeEach(() => {
    requireAuthState.allowed = true;
  });

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  async function buildApp(role = "Owner") {
    const app = Fastify();
    apps.push(app);
    app.addHook("preHandler", async (req) => {
      (req as { user?: { uuid: string; role: string } }).user = {
        uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        role,
      };
    });
    await registerInsuranceLawsuitRoutes(app);
    return app;
  }

  it("GET is 410 Gone — ENG-60 insurance.lawsuit retired (no SQL; the table is dropped)", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/insurance/lawsuits?operating_company_id=11111111-1111-4111-8111-111111111111",
    });
    expect(response.statusCode).toBe(410);
    expect(response.json()).toMatchObject({ error: "insurance_lawsuit_retired", redirect: "/legal/lawsuits" });
  });

  it("every verb still requires a session (401 before 410)", async () => {
    requireAuthState.allowed = false;
    const app = await buildApp();
    for (const [method, url] of [["GET", "/api/v1/insurance/lawsuits"], ["POST", "/api/v1/insurance/lawsuits"], ["PATCH", "/api/v1/insurance/lawsuits/x"]] as const) {
      const response = await app.inject({ method, url, payload: method === "GET" ? undefined : {} });
      expect(response.statusCode).toBe(401);
    }
  });

  it("POST is 410 Gone — ENG-60 insurance.lawsuit retired", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/insurance/lawsuits",
      payload: {
        operating_company_id: "11111111-1111-4111-8111-111111111111",
        case_number: "CASE-100",
        plaintiff: "Acme Logistics",
        defendant: "RoadRunner Inc",
        court_name: "Harris County District Court",
        filed_date: "2026-05-01",
        claim_id: "11111111-1111-4111-8111-111111111111",
        demand_cents: 250000,
      },
    });

    expect(response.statusCode).toBe(410);
    expect(response.json()).toMatchObject({
      error: "insurance_lawsuit_retired",
      redirect: "/legal/lawsuits",
    });
  });

  it("PATCH is 410 Gone — ENG-60 insurance.lawsuit retired", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "PATCH",
      url: "/api/v1/insurance/lawsuits/aaaaaaaa-1111-4111-8111-111111111111?operating_company_id=11111111-1111-4111-8111-111111111111",
      payload: {
        status: "active",
      },
    });

    expect(response.statusCode).toBe(410);
    expect(response.json()).toMatchObject({
      error: "insurance_lawsuit_retired",
      redirect: "/legal/lawsuits",
    });
  });
});
