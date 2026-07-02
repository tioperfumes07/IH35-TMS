import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  evaluateReeferHoursPmDue,
  extractReeferEngineHours,
  hoursUntilReeferService,
  mapReeferHoursLogRow,
  mapReeferSpecsRow,
  reeferHoursSourceLabel,
  registerMaintenanceReeferHoursRoutes,
} from "../reefer-hours.routes.js";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const EQUIPMENT_ID = "22222222-2222-4222-8222-222222222222";

const { mockQuery, mockWithCurrentUser, mockAppendCrudAudit } = vi.hoisted(() => {
  const query = vi.fn();
  const withCurrentUser = vi.fn(async (_userId: string, fn: (client: { query: typeof query }) => Promise<unknown>) =>
    fn({ query })
  );
  const appendCrudAudit = vi.fn(async () => undefined);
  return { mockQuery: query, mockWithCurrentUser: withCurrentUser, mockAppendCrudAudit: appendCrudAudit };
});

vi.mock("../../auth/db.js", () => ({
  withCurrentUser: mockWithCurrentUser,
}));

vi.mock("../../auth/session-middleware.js", () => ({
  requireAuth: () => true,
}));

vi.mock("../../audit/crud-audit.js", () => ({
  appendCrudAudit: mockAppendCrudAudit,
}));

// Cross-tenant guard: assertCompanyMembership() is covered by a dedicated membership test;
// no-op here so these unit tests exercise route logic with pre-change behavior.
vi.mock("../../_helpers/company-membership-guard.js", () => ({
  assertCompanyMembership: vi.fn(async () => undefined),
}));


describe("reefer hours helpers (A19)", () => {
  it("maps reefer hours source labels", () => {
    expect(reeferHoursSourceLabel("samsara")).toBe("Samsara");
    expect(reeferHoursSourceLabel("manual")).toBe("Manual");
  });

  it("extracts engine hours from Samsara payload", () => {
    expect(extractReeferEngineHours({ engine_hours: 4400.5 })).toBe(4400.5);
    expect(extractReeferEngineHours({ vehicle: { engineHours: 1200 } })).toBe(1200);
    expect(extractReeferEngineHours({})).toBeNull();
  });

  it("evaluates reefer PM due status by hours interval", () => {
    expect(evaluateReeferHoursPmDue(4500, 2500, 2000)).toBe("due");
    expect(evaluateReeferHoursPmDue(4450, 2500, 2000, 50)).toBe("near_due");
    expect(evaluateReeferHoursPmDue(3000, 2500, 2000)).toBe("current");
  });

  it("computes hours until reefer service", () => {
    expect(hoursUntilReeferService(4300, 2500, 2000)).toBe(200);
    expect(hoursUntilReeferService(null, 2500, 2000)).toBeNull();
  });

  it("maps reefer specs row with PM status", () => {
    const mapped = mapReeferSpecsRow(
      {
        id: "spec-1",
        operating_company_id: COMPANY,
        equipment_id: EQUIPMENT_ID,
        reefer_brand: "Carrier",
        service_interval_hours: 2000,
        last_service_hours: 2500,
        last_service_date: "2026-01-01",
        notes: "",
        updated_at: "2026-06-04T08:00:00Z",
      },
      4600
    );
    expect(mapped.pm_status).toBe("due");
    expect(mapped.hours_until_service).toBe(0);
    expect(mapped.reefer_brand).toBe("Carrier");
  });
});

describe("reefer hours routes (A19)", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    mockQuery.mockReset();
    mockAppendCrudAudit.mockReset();
    app = Fastify({ logger: false });
    app.decorateRequest("user", null);
    app.addHook("preHandler", async (req) => {
      req.user = {
        uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        role: "Manager",
        email: "maint@ih35.local",
      };
    });
    await registerMaintenanceReeferHoursRoutes(app);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns reefer hours log rows", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("FROM maintenance.reefer_hours_log")) {
        return {
          rows: [
            {
              id: "log-1",
              operating_company_id: COMPANY,
              equipment_id: EQUIPMENT_ID,
              hours_reading: 4400,
              source: "manual",
              recorded_at: "2026-06-04T08:00:00Z",
              notes: "",
              samsara_event_id: null,
              archived_at: null,
              created_at: "2026-06-04T08:00:00Z",
            },
          ],
        };
      }
      return { rows: [] };
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/maintenance/reefer-hours/log?operating_company_id=${COMPANY}&equipment_id=${EQUIPMENT_ID}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { rows: ReturnType<typeof mapReeferHoursLogRow>[] };
    expect(body.rows[0]?.source_label).toBe("Manual");
    expect(body.rows[0]?.hours_reading).toBe(4400);
  });

  it("creates manual reefer hours log entry", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("FROM maintenance.reefer_specs") && sql.includes("LIMIT 1")) {
        return {
          rows: [
            {
              id: "spec-1",
              operating_company_id: COMPANY,
              equipment_id: EQUIPMENT_ID,
              equipment_number: "T-100",
              reefer_brand: "Carrier",
              service_interval_hours: 2000,
              last_service_hours: 2500,
              last_service_date: "2026-01-01",
              notes: "",
              archived_at: null,
              updated_at: "2026-06-04T08:00:00Z",
            },
          ],
        };
      }
      if (sql.includes("INSERT INTO maintenance.reefer_hours_log")) {
        return { rows: [{ id: "log-new" }] };
      }
      if (sql.includes("FROM maintenance.reefer_hours_log l") && sql.includes("WHERE l.id")) {
        return {
          rows: [
            {
              id: "log-new",
              operating_company_id: COMPANY,
              equipment_id: EQUIPMENT_ID,
              hours_reading: 4500,
              source: "manual",
              recorded_at: "2026-06-04T09:00:00Z",
              notes: "Shop reading",
              samsara_event_id: null,
              archived_at: null,
              created_at: "2026-06-04T09:00:00Z",
            },
          ],
        };
      }
      if (sql.includes("ORDER BY l.recorded_at DESC") && sql.includes("LIMIT 1")) return { rows: [] };
      if (sql.includes("FROM mdata.equipment")) return { rows: [] };
      return { rows: [] };
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/maintenance/reefer-hours/log",
      payload: {
        operating_company_id: COMPANY,
        equipment_id: EQUIPMENT_ID,
        hours_reading: 4500,
        notes: "Shop reading",
      },
    });
    expect(res.statusCode).toBe(201);
    expect((res.json() as { hours_reading: number }).hours_reading).toBe(4500);
  });
});
