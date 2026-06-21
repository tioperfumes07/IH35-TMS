import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testAuthHeaders } from "../../test-helpers/auth-fixture.js";
import { ensureIntegrationPrerequisites, getOperatingCompanyId } from "../../test-helpers/db-fixture.js";
import { createIntegrationApp } from "../../test-helpers/http-app.js";
import { registerCoaEntityProbeRoutes } from "./coa-entity-probe.routes.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("coa-entity-probe route", () => {
  let app: FastifyInstance;
  let companyId: string;

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    companyId = getOperatingCompanyId();
    app = await createIntegrationApp(async (a) => {
      await registerCoaEntityProbeRoutes(a);
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("rejects unauthenticated callers", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/accounting/coa-entity-probe?operating_company_id=${companyId}`,
    });
    expect(res.statusCode).toBe(401);
  });

  it("forbids non-owner/admin roles", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/accounting/coa-entity-probe?operating_company_id=${companyId}`,
      headers: testAuthHeaders(undefined, "Dispatcher"),
    });
    expect(res.statusCode).toBe(403);
  });

  it("returns 200 + the exact probe key shape for Owner", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/accounting/coa-entity-probe?operating_company_id=${companyId}`,
      headers: testAuthHeaders(undefined, "Owner"),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Record<string, unknown>;
    expect(body).toHaveProperty("accounts_total");
    expect(typeof body.accounts_total).toBe("number");
    expect(Array.isArray(body.by_operating_company)).toBe(true);
    expect(body).toHaveProperty("null_operating_company");
    expect(Array.isArray(body.by_system_purpose)).toBe(true);
    expect(body).toHaveProperty("system_purpose_set_count");
    expect(body).toHaveProperty("stage_migrations_applied");
    const stages = body.stage_migrations_applied as Record<string, unknown>;
    for (const k of [
      "stage1_entity_columns",
      "stage2_backfill_transp",
      "stage3_decommingle_trk",
      "stage4_unique_index",
      "stage5_usmca_seed",
    ]) {
      expect(typeof stages[k]).toBe("boolean");
    }
    expect(typeof body.stage4_index_exists).toBe("boolean");
    expect(Array.isArray(body.system_purpose_duplicates_active)).toBe(true);
    expect(typeof body.stage4_safe_to_constrain).toBe("boolean");
  });
});
