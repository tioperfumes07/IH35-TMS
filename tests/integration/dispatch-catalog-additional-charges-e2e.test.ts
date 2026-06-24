import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { registerDispatchCatalogRoutes } from "../../apps/backend/src/catalogs/dispatch/index";
import { ensureIntegrationPrerequisites } from "../../apps/backend/test-helpers/db-fixture";
import { createIntegrationApp } from "../../apps/backend/test-helpers/http-app";
import { testAuthHeaders } from "../../apps/backend/test-helpers/auth-fixture";

// CI GUARD (2026-06-24) — FIX-3. registerDispatchCatalogRoutes (load-types / detention-reasons /
// pickup-time-types / additional-charges) was DEFINED in catalogs/dispatch/index.ts but never mounted in
// index.ts alongside its siblings, so GET /api/v1/catalogs/dispatch/additional-charges (the Book Load
// "+ Create charge" code list) returned 404 (SPA shell). This guard mounts the routes and asserts the
// endpoint responds 200 with a list shape — so the route can never silently fall out of the app again.
const describeE2E = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeE2E("dispatch catalog additional-charges — E2E (FIX-3 route-mounted 200 guard)", () => {
  let app: FastifyInstance;
  let companyId: string;

  beforeAll(async () => {
    companyId = await ensureIntegrationPrerequisites();
    app = await createIntegrationApp(async (a) => {
      await registerDispatchCatalogRoutes(a);
    });
  });

  afterAll(async () => {
    await app?.close();
  });

  it("GET /api/v1/catalogs/dispatch/additional-charges returns 200 + a list shape (was 404)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/catalogs/dispatch/additional-charges?operating_company_id=${companyId}&is_active=true&limit=200`,
      headers: { ...testAuthHeaders() },
    });
    expect(res.statusCode, `expected 200, got ${res.statusCode}: ${res.body}`).toBe(200);
    const body = JSON.parse(res.body) as { rows?: unknown[]; total?: number };
    expect(Array.isArray(body.rows)).toBe(true);
    expect(typeof body.total).toBe("number");
  });
});
