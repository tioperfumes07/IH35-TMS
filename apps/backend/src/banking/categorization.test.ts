import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testAuthHeaders } from "../../test-helpers/auth-fixture.js";
import { ensureIntegrationPrerequisites, getOperatingCompanyId } from "../../test-helpers/db-fixture.js";
import { createIntegrationApp } from "../../test-helpers/http-app.js";
import { registerBankTxCategorizationRoutes } from "./categorization.routes.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("bank tx categorization routes", () => {
  let app: FastifyInstance;
  let companyId: string;

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    companyId = getOperatingCompanyId();
    app = await createIntegrationApp(async (a) => {
      await registerBankTxCategorizationRoutes(a);
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /api/v1/banking/transactions/uncategorized rejects unauthenticated callers", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/banking/transactions/uncategorized?operating_company_id=${companyId}`,
    });
    expect(res.statusCode).toBe(401);
  });

  it("GET /api/v1/banking/transactions/uncategorized validates query params", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/banking/transactions/uncategorized?operating_company_id=not-a-uuid`,
      headers: testAuthHeaders(undefined, "Owner"),
    });
    expect(res.statusCode).toBe(400);
  });

  it("GET /api/v1/banking/transactions/uncategorized returns envelope fields", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/banking/transactions/uncategorized?operating_company_id=${companyId}&limit=5`,
      headers: testAuthHeaders(undefined, "Owner"),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { rows?: unknown; total_count?: unknown; total_uncategorized_cents?: unknown };
    expect(Array.isArray(body.rows)).toBe(true);
    expect(typeof body.total_count).toBe("number");
    expect(typeof body.total_uncategorized_cents).toBe("number");
  });

  it("POST /api/v1/banking/transactions/:id/categorize returns 404 for unknown ids", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/banking/transactions/${randomUUID()}/categorize?operating_company_id=${companyId}`,
      headers: { "content-type": "application/json", ...testAuthHeaders(undefined, "Owner") },
      payload: { category_kind: "misc" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("POST /api/v1/banking/transactions/categorize-bulk validates payloads via zod", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/banking/transactions/categorize-bulk`,
      headers: { "content-type": "application/json", ...testAuthHeaders(undefined, "Owner") },
      payload: { operating_company_id: companyId, transaction_ids: [], category_kind: "misc" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("POST /api/v1/banking/transactions/:id/transfer validates payloads via zod", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/banking/transactions/${randomUUID()}/transfer?operating_company_id=${companyId}`,
      headers: { "content-type": "application/json", ...testAuthHeaders(undefined, "Owner") },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it("POST /api/v1/banking/transactions/:id/skip validates payload via zod", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/banking/transactions/${randomUUID()}/skip?operating_company_id=${companyId}`,
      headers: { "content-type": "application/json", ...testAuthHeaders(undefined, "Owner") },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it("POST /api/v1/banking/transactions/:id/investigate validates payload via zod", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/banking/transactions/${randomUUID()}/investigate?operating_company_id=${companyId}`,
      headers: { "content-type": "application/json", ...testAuthHeaders(undefined, "Owner") },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("bank tx categorization routes (always-on smoke)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createIntegrationApp(async (a) => {
      await registerBankTxCategorizationRoutes(a);
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /api/v1/banking/transactions/uncategorized rejects unauthenticated callers without DATABASE fixtures", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/banking/transactions/uncategorized?operating_company_id=${randomUUID()}`,
    });
    expect(res.statusCode).toBe(401);
  });
});
