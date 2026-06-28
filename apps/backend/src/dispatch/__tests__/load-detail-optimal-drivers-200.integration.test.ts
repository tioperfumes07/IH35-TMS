/**
 * Lane A regression lock (trailer_id/trailer_type 500 class) — runs against the from-migrations CI DB.
 *
 * GUARD live-read 2026-06-27: GET dispatch load-detail + optimal-drivers 500'd because the SQL referenced
 * mdata.loads.trailer_id (does not exist) / l.trailer_type (prod<->migration drift) → Postgres 42703
 * "undefined column". Fixed on main: loads.routes.ts:638 dropped the l.trailer_id join (uses
 * assigned_unit_id), driver-optimizer.service.ts selects NULL::text AS trailer_type, and
 * dispatch-refinements.service.ts joins mdata.units on assigned_unit_id.
 *
 * This test locks the class: on a FROM-MIGRATIONS database, both endpoints must EXECUTE THEIR QUERY
 * cleanly — i.e. NEVER 500. A 42703 column-reference regression would surface as 500 regardless of whether
 * any rows match, so a 404 for an unknown id proves the query planned + ran (no fictional column). Gated to
 * CI (GITHUB_ACTIONS) where a migrated Postgres is present.
 */
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { testAuthHeaders } from "../../../test-helpers/auth-fixture.js";
import { ensureIntegrationPrerequisites, getOperatingCompanyId } from "../../../test-helpers/db-fixture.js";
import { createIntegrationApp } from "../../../test-helpers/http-app.js";
import { registerDispatchLoadRoutes } from "../loads.routes.js";
import { registerDispatchRefinementsRoutes } from "../dispatch-refinements.routes.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("dispatch load-detail + optimal-drivers (trailer_id/type 500 regression lock)", () => {
  let app: FastifyInstance;
  let companyId: string;
  const unknownLoadId = randomUUID();

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    companyId = getOperatingCompanyId();
    app = await createIntegrationApp(async (a) => {
      await registerDispatchLoadRoutes(a);
      await registerDispatchRefinementsRoutes(a);
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET load-detail for an unknown id does NOT 500 (query runs; no l.trailer_id 42703)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/dispatch/loads/${unknownLoadId}?operating_company_id=${companyId}`,
      headers: testAuthHeaders(),
    });
    // 42703 (fictional trailer_id/trailer_type column) would be a 500. The query executing cleanly on a
    // from-migrations DB yields 404 (no such load) — never 500.
    expect(res.statusCode).not.toBe(500);
    expect([200, 404]).toContain(res.statusCode);
  });

  it("GET optimal-drivers for an unknown id does NOT 500 (NULL::text trailer_type; assigned_unit_id join)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/dispatch/loads/${unknownLoadId}/optimal-drivers?operating_company_id=${companyId}`,
      headers: testAuthHeaders(),
    });
    expect(res.statusCode).not.toBe(500);
    expect([200, 404]).toContain(res.statusCode);
  });
});
