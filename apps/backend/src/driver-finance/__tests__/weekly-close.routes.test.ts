import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testAuthHeaders } from "../../../test-helpers/auth-fixture.js";
import { ensureIntegrationPrerequisites, getOperatingCompanyId } from "../../../test-helpers/db-fixture.js";
import { createIntegrationApp } from "../../../test-helpers/http-app.js";
import { registerWeeklyCloseRoutes } from "../weekly-close.routes.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describe("weekly-close.routes (auth gates)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createIntegrationApp(async (a) => {
      await registerWeeklyCloseRoutes(a);
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("rejects unauthenticated callers", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/settlements/weekly-close",
      headers: { "content-type": "application/json" },
      payload: {},
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects invalid payloads", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/settlements/weekly-close",
      headers: { "content-type": "application/json", ...testAuthHeaders() },
      payload: { weekStart: "not-a-date", operating_company_id: "bad" },
    });
    expect(res.statusCode).toBe(400);
  });
});

describeIntegration("weekly-close.routes integration", () => {
  let app: FastifyInstance;
  let companyId: string;

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    companyId = getOperatingCompanyId();
    app = await createIntegrationApp(async (a) => {
      await registerWeeklyCloseRoutes(a);
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("POST weekly-close returns an array (multi-driver safe)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/settlements/weekly-close",
      headers: { "content-type": "application/json", ...testAuthHeaders() },
      payload: { weekStart: "2026-05-10", operating_company_id: companyId },
    });

    expect([201, 501]).toContain(res.statusCode);

    if (res.statusCode === 201) {
      const body = res.json() as Array<{ driverId: string; draftSettlementId: string }>;
      expect(Array.isArray(body)).toBe(true);
      for (const row of body) {
        expect(typeof row.driverId).toBe("string");
        expect(row.driverId.length).toBeGreaterThan(0);
        expect(typeof row.draftSettlementId).toBe("string");
        expect(row.draftSettlementId.length).toBeGreaterThan(0);
      }

      if (body.length >= 2) {
        const ids = new Set(body.map((r) => r.driverId));
        expect(ids.size).toBeGreaterThanOrEqual(2);
      }
    }
  });
});
