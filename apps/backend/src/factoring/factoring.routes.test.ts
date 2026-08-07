import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerFactoringRoutes } from "./factoring.routes.js";

const companyId = "11111111-1111-4111-8111-111111111111";
const faroVendorId = "22222222-2222-4222-8222-222222222222";

const resolveCanonicalActiveFactor = vi.fn();

vi.mock("../home/factoring-balance-invoice-linkage.service.js", () => ({
  resolveCanonicalActiveFactor: (...args: unknown[]) => resolveCanonicalActiveFactor(...args),
}));

vi.mock("../auth/session-middleware.js", () => ({
  requireAuth: () => true,
}));

vi.mock("../auth/db.js", () => ({
  withCurrentUser: async (_userId: string, fn: (client: { query: typeof queryMock }) => Promise<unknown>) =>
    fn({ query: queryMock }),
}));

vi.mock("../_helpers/company-membership-guard.js", () => ({
  assertCompanyMembership: async () => {},
}));

const queryMock = vi.fn(async (sql: string) => {
  if (sql.includes("set_config('app.operating_company_id'")) return { rows: [] };
  if (sql.includes("FROM views.factoring_summary")) return { rows: [] };
  if (sql.includes("FROM views.factoring_statements_settings")) return { rows: [] };
  return { rows: [] };
});

describe("factoring.routes active factor identity", () => {
  const apps: Array<ReturnType<typeof Fastify>> = [];

  beforeEach(() => {
    queryMock.mockClear();
    resolveCanonicalActiveFactor.mockReset();
    resolveCanonicalActiveFactor.mockResolvedValue({
      ok: true,
      reason: null,
      operatingCompanyId: companyId,
      companyCode: "TRANSP",
      vendorId: faroVendorId,
      vendorName: "Faro Factoring LLC",
      agreementId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      factorProfileId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    });
  });

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  async function buildApp() {
    const app = Fastify();
    apps.push(app);
    app.decorateRequest("user", null);
    app.addHook("preHandler", async (req) => {
      (req as unknown as { user: { uuid: string; role: string } }).user = {
        uuid: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        role: "Owner",
      };
    });
    await registerFactoringRoutes(app);
    return app;
  }

  it("summary resolves active factor via canonical agreement gate", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/factoring/summary?operating_company_id=${companyId}`,
    });

    expect(response.statusCode).toBe(200);
    expect(resolveCanonicalActiveFactor).toHaveBeenCalledTimes(1);
    expect(response.json()).toMatchObject({
      active_factor_id: faroVendorId,
      active_factor_name: "Faro Factoring LLC",
      active_factor_profile_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    });
  });

  it("statements-settings resolves active factor via canonical agreement gate", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/factoring/statements-settings?operating_company_id=${companyId}`,
    });

    expect(response.statusCode).toBe(200);
    expect(resolveCanonicalActiveFactor).toHaveBeenCalledTimes(1);
    expect(response.json().current).toMatchObject({
      active_factor_id: faroVendorId,
      active_factor_name: "Faro Factoring LLC",
      active_factor_profile_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    });
  });

  it("returns null active factor when canonical gate fails closed", async () => {
    resolveCanonicalActiveFactor.mockResolvedValue({
      ok: false,
      reason: "missing_faro_agreement_binding",
      operatingCompanyId: companyId,
      companyCode: "TRANSP",
      vendorId: null,
      vendorName: null,
      agreementId: null,
      factorProfileId: null,
    });

    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/factoring/summary?operating_company_id=${companyId}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      active_factor_id: null,
      active_factor_name: null,
      active_factor_profile_id: null,
    });
  });
});
