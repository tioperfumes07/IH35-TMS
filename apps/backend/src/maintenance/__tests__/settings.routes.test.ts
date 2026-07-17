import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerMaintenanceSettingsRoutes } from "../settings.routes.js";

const COMPANY = "11111111-1111-4111-8111-111111111111";

const { mockQuery, mockWithCurrentUser } = vi.hoisted(() => {
  const query = vi.fn();
  const withCurrentUser = vi.fn(async (_userId: string, fn: (client: { query: typeof query }) => Promise<unknown>) =>
    fn({ query })
  );
  return { mockQuery: query, mockWithCurrentUser: withCurrentUser };
});

vi.mock("../../auth/db.js", () => ({
  withCurrentUser: mockWithCurrentUser,
}));

vi.mock("../../auth/session-middleware.js", () => ({
  requireAuth: () => true,
}));

vi.mock("../../_helpers/company-membership-guard.js", () => ({
  assertCompanyMembership: vi.fn(async () => undefined),
}));

vi.mock("../../audit/crud-audit.js", () => ({
  appendCrudAudit: vi.fn(async () => undefined),
}));

describe("maintenance settings routes", () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    mockQuery.mockReset();
    app = Fastify({ logger: false });
    app.decorateRequest("user", null);
    app.addHook("preHandler", async (req) => {
      req.user = {
        uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        role: "Administrator",
        email: "admin@ih35.local",
      };
    });
    await registerMaintenanceSettingsRoutes(app);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("GET /api/v1/maintenance/settings returns persisted fields", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("to_regclass")) return { rows: [{ ok: true }] };
      if (sql.includes("FROM maintenance.maintenance_settings")) {
        return {
          rows: [
            {
              operating_company_id: COMPANY,
              pm_interval_days_default: 45,
              notification_email_enabled: false,
              default_shop_location: "North yard",
              bay_assignment_policy: "Manual assign",
            },
          ],
        };
      }
      if (sql.includes("pm_schedules")) return { rows: [{ pm_schedules: 3 }] };
      if (sql.includes("maintenance_vendors")) return { rows: [{ maintenance_vendors: 7 }] };
      return { rows: [] };
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/maintenance/settings?operating_company_id=${COMPANY}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      pm_interval_days_default: 45,
      notification_email_enabled: false,
      default_shop_location: "North yard",
      bay_assignment_policy: "Manual assign",
      pm_schedules: 3,
      maintenance_vendors: 7,
    });
  });

  it("PATCH /api/v1/maintenance/settings saves instead of 404", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("to_regclass")) return { rows: [{ ok: true }] };
      if (sql.includes("UPDATE maintenance.maintenance_settings")) {
        return {
          rows: [
            {
              id: "settings-row-1",
              operating_company_id: COMPANY,
              pm_interval_days_default: 60,
              notification_email_enabled: true,
              default_shop_location: "South yard",
              bay_assignment_policy: "Auto-assign by first available bay",
            },
          ],
        };
      }
      if (sql.includes("pm_schedules")) return { rows: [{ pm_schedules: 1 }] };
      if (sql.includes("maintenance_vendors")) return { rows: [{ maintenance_vendors: 2 }] };
      return { rows: [] };
    });

    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/maintenance/settings?operating_company_id=${COMPANY}`,
      payload: { pm_interval_days_default: 60, default_shop_location: "South yard" },
    });
    expect(res.statusCode).not.toBe(404);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      pm_interval_days_default: 60,
      default_shop_location: "South yard",
    });
  });
});
