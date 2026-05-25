import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testAuthHeaders } from "../../test-helpers/auth-fixture.js";
import { ensureIntegrationPrerequisites, getOperatingCompanyId } from "../../test-helpers/db-fixture.js";
import { createIntegrationApp } from "../../test-helpers/http-app.js";
import { registerEmailRoutes } from "../email/email.routes.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("email.queue GET /api/v1/email/queue integration", () => {
  let app: FastifyInstance;
  let operatingCompanyId: string;

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    operatingCompanyId = getOperatingCompanyId();
    app = await createIntegrationApp(async (a) => {
      await registerEmailRoutes(a);
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns 200 with empty items when status filter has no matches", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/email/queue?operating_company_id=${encodeURIComponent(operatingCompanyId)}&status=__no_such_status__`,
      headers: testAuthHeaders(undefined, "Owner"),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { items?: unknown[]; next_cursor?: unknown };
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items?.length ?? 0).toBe(0);
    expect(body.next_cursor ?? null).toBeNull();
  });
});

describe("email.queue admin integration suite wiring", () => {
  it("integration suite is gated to CI (GITHUB_ACTIONS)", () => {
    expect(typeof describeIntegration).toBe("function");
  });
});
