import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerSafetyAudit425cRoutes } from "../audit-425c.routes.js";
import { registerSafetyBackgroundChecksRoutes } from "../background-checks.routes.js";
import { registerSafetyDriverDocumentsRoutes } from "../driver-documents.routes.js";
import { registerSafetyDriverProfileRoutes } from "../driver-profile.routes.js";
import {
  SAFETY_DRUG_POOL_DEPRECATED,
  SAFETY_DRUG_POOL_DEPRECATION_HEADERS,
  SAFETY_DRUG_POOL_SUNSET,
  registerSafetyDrugPoolRoutes,
} from "../drug-pool.routes.js";
import { registerSafetyHosRoutes } from "../hos.routes.js";
import { registerSafetyIntegrityAlertsRoutes } from "../integrity-alerts.routes.js";
import { registerSafetyReportsRoutes } from "../reports/safety-reports.routes.js";
import { registerSafetySettingsRoutes } from "../settings.routes.js";
import { registerSafetyTrainingProgramsRoutes } from "../training-programs.routes.js";
import { registerSafetyTrainingRecordsRoutes } from "../training-records.routes.js";
import { registerSafetyDvirRoutes } from "../dvir.routes.js";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const DRIVER = "22222222-2222-4222-8222-222222222222";

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

type RouteCase = {
  name: string;
  register: (app: FastifyInstance) => Promise<void>;
  method: "GET" | "POST" | "PATCH";
  url: string;
  payload?: Record<string, unknown>;
};

const mountedRoutes: RouteCase[] = [
  {
    name: "settings",
    register: registerSafetySettingsRoutes,
    method: "GET",
    url: `/api/v1/safety/settings?operating_company_id=${COMPANY}`,
  },
  {
    name: "integrity-alerts",
    register: registerSafetyIntegrityAlertsRoutes,
    method: "GET",
    url: `/api/v1/safety/integrity-alerts/list?operating_company_id=${COMPANY}`,
  },
  {
    name: "training-programs",
    register: registerSafetyTrainingProgramsRoutes,
    method: "POST",
    url: `/api/v1/safety/training-programs?operating_company_id=${COMPANY}`,
    payload: { name: "Entry", category: "entry_level", frequency: "annual" },
  },
  {
    name: "training-records",
    register: registerSafetyTrainingRecordsRoutes,
    method: "POST",
    url: `/api/v1/safety/training-records?operating_company_id=${COMPANY}`,
    payload: {
      driver_id: DRIVER,
      training_name: "Defensive Driving",
      completed_at: "2026-06-01T00:00:00.000Z",
    },
  },
  {
    name: "hos-exceptions",
    register: registerSafetyHosRoutes,
    method: "POST",
    url: `/api/v1/safety/hos/exceptions?operating_company_id=${COMPANY}`,
    payload: {
      driver_id: DRIVER,
      exception_type: "adverse_driving",
      exception_date: "2026-06-01",
      justification: "Weather delay",
    },
  },
  {
    name: "audit-425c",
    register: registerSafetyAudit425cRoutes,
    method: "GET",
    url: `/api/v1/safety/audit-425c?operating_company_id=${COMPANY}`,
  },
  {
    name: "background-checks",
    register: registerSafetyBackgroundChecksRoutes,
    method: "POST",
    url: `/api/v1/safety/background-checks?operating_company_id=${COMPANY}`,
    payload: {
      driver_id: DRIVER,
      check_type: "mvr",
      result: "pass",
      checked_at: "2026-06-01T00:00:00.000Z",
    },
  },
  {
    name: "driver-profile",
    register: registerSafetyDriverProfileRoutes,
    method: "GET",
    url: `/api/v1/safety/driver-profiles/${DRIVER}?operating_company_id=${COMPANY}`,
  },
  {
    name: "driver-documents",
    register: registerSafetyDriverDocumentsRoutes,
    method: "POST",
    url: `/api/v1/safety/driver-documents?operating_company_id=${COMPANY}`,
    payload: {
      driver_id: DRIVER,
      doc_type: "medical_card",
    },
  },
  {
    name: "safety-reports",
    register: registerSafetyReportsRoutes,
    method: "GET",
    url: `/api/v1/safety/reports/summary?operating_company_id=${COMPANY}`,
  },
  {
    name: "dvir",
    register: registerSafetyDvirRoutes,
    method: "GET",
    url: `/api/v1/safety/dvir?operating_company_id=${COMPANY}`,
  },
];

describe("safety route registration (A23-1)", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    mockQuery.mockReset();
    mockWithCurrentUser.mockClear();
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("driver_safety_profiles")) {
        return { rows: [{ id: "profile-1", medical_days_to_expiry: 45 }], rowCount: 1 };
      }
      if (sql.includes("safety_settings")) {
        return { rows: [{ id: "settings-1", dashboard_active_window_days: 14 }], rowCount: 1 };
      }
      return { rows: [{ id: "row-1" }], rowCount: 1 };
    });
    app = Fastify({ logger: false });
    app.decorateRequest("user", null);
    app.addHook("preHandler", async (req) => {
      req.user = {
        uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        role: "Safety",
        email: "safety@ih35.local",
      };
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it.each(mountedRoutes)("registers $name and does not return 404", async ({ register, method, url, payload }) => {
    await register(app);
    await app.ready();
    const res = await app.inject({ method, url, payload });
    expect(res.statusCode).not.toBe(404);
  });

  it("index.ts imports match exported registrars for mounted modules", async () => {
    const indexSource = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("../../index.ts", import.meta.url), "utf8")
    );
    for (const route of mountedRoutes) {
      expect(indexSource).toContain(`${route.register.name}(`);
    }
  });
});

describe("settings save route", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    mockQuery.mockReset();
    mockWithCurrentUser.mockClear();
    mockQuery.mockResolvedValue({
      rows: [{ id: "settings-1", dashboard_active_window_days: 14 }],
      rowCount: 1,
    });
    app = Fastify({ logger: false });
    app.decorateRequest("user", null);
    app.addHook("preHandler", async (req) => {
      req.user = {
        uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        role: "Safety",
        email: "safety@ih35.local",
      };
    });
    await registerSafetySettingsRoutes(app);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("PATCH /api/v1/safety/settings saves instead of 404", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/safety/settings?operating_company_id=${COMPANY}`,
      payload: { dashboard_active_window_days: 21 },
    });
    expect(res.statusCode).not.toBe(404);
    expect(res.statusCode).toBe(200);
  });
});

describe("deprecated drug-pool module", () => {
  it("exports deprecation constants without mounting requirement", () => {
    expect(SAFETY_DRUG_POOL_DEPRECATED).toBe(true);
    expect(SAFETY_DRUG_POOL_SUNSET).toBe("2026-09-01");
    expect(SAFETY_DRUG_POOL_DEPRECATION_HEADERS.Deprecation).toBe("true");
    expect(SAFETY_DRUG_POOL_DEPRECATION_HEADERS.Sunset).toBe(SAFETY_DRUG_POOL_SUNSET);
  });

  it("returns Sunset headers when handler is invoked", async () => {
    mockQuery.mockResolvedValue({ rows: [{ id: DRIVER }], rowCount: 1 });
    const app = Fastify({ logger: false });
    app.decorateRequest("user", null);
    app.addHook("preHandler", async (req) => {
      req.user = {
        uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        role: "Safety",
        email: "safety@ih35.local",
      };
    });
    await registerSafetyDrugPoolRoutes(app);
    await app.ready();
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/safety/drug-pool/selections?operating_company_id=${COMPANY}`,
      payload: {
        period: "2026-H1",
        annual_drug_rate: 0.5,
        annual_alcohol_rate: 0.1,
        seed: "seed-a",
      },
    });
    expect(res.headers.sunset).toBe(SAFETY_DRUG_POOL_SUNSET);
    expect(res.headers.deprecation).toBe("true");
    await app.close();
  });
});
