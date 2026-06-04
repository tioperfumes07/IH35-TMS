import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { APPLICANT_STATUSES, registerIdentityApplicantRoutes } from "../applicants.routes.js";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const APPLICANT = "22222222-2222-4222-8222-222222222222";
const TOKEN = "a".repeat(32);
const DRIVER = "33333333-3333-4333-8333-333333333333";
const SESSION = "44444444-4444-4444-8444-444444444444";

const mockLuciaBypass = vi.fn();
const mockWithCurrentUser = vi.fn();

vi.mock("../../auth/db.js", () => ({
  withLuciaBypass: (...args: unknown[]) => mockLuciaBypass(...args),
  withCurrentUser: (...args: unknown[]) => mockWithCurrentUser(...args),
}));

vi.mock("../../auth/session-middleware.js", () => ({
  requireAuth: () => true,
}));

vi.mock("../../audit/crud-audit.js", () => ({
  appendCrudAudit: vi.fn(async () => undefined),
}));

function officeClient(queryImpl: (sql: string) => unknown) {
  return {
    query: vi.fn(async (sql: string) => {
      const out = queryImpl(sql);
      if (out !== undefined) return out;
      return { rows: [], rowCount: 0 };
    }),
  };
}

describe("identity applicant routes (A24-12)", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    mockLuciaBypass.mockReset();
    mockWithCurrentUser.mockReset();

    app = Fastify({ logger: false });
    app.decorateRequest("user", null);
    app.addHook("preHandler", async (req) => {
      req.user = {
        uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        role: "Manager",
        email: "office@ih35.local",
      };
    });
    await registerIdentityApplicantRoutes(app);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("exports applicant pipeline statuses", () => {
    expect(APPLICANT_STATUSES).toEqual(["new", "screening", "interview", "offer", "hired", "declined", "withdrawn"]);
  });

  it("GET /api/v1/public/apply/:token returns portal compliance payload", async () => {
    mockLuciaBypass.mockImplementation(async (fn: (client: { query: ReturnType<typeof vi.fn> }) => Promise<unknown>) =>
      fn({
        query: vi.fn(async () => ({
          rows: [{ operating_company_id: COMPANY, intake_token: TOKEN, company_name: "IH 35 Transport" }],
        })),
      })
    );
    const res = await app.inject({ method: "GET", url: `/api/v1/public/apply/${TOKEN}` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { company_name: string; compliance: { minimum_age: number } };
    expect(body.company_name).toBe("IH 35 Transport");
    expect(body.compliance.minimum_age).toBe(21);
  });

  it("POST /api/v1/public/apply/:token rejects applicants under 21", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/public/apply/${TOKEN}`,
      payload: {
        first_name: "Jane",
        last_name: "Doe",
        phone: "+15551234567",
        date_of_birth: "2010-01-01",
        fcra_consent: true,
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: "applicant_under_minimum_age" });
  });

  it("POST /api/v1/public/apply/:token creates applicant record", async () => {
    mockLuciaBypass.mockImplementation(async (fn: (client: { query: ReturnType<typeof vi.fn> }) => Promise<unknown>) => {
      const client = {
        query: vi.fn(async (sql: string) => {
          if (sql.includes("FROM identity.driver_applicants da")) {
            return { rows: [{ operating_company_id: COMPANY, company_name: "IH 35 Transport" }] };
          }
          if (sql.includes("INSERT INTO identity.driver_applicants")) {
            return {
              rows: [
                {
                  id: APPLICANT,
                  operating_company_id: COMPANY,
                  record_kind: "applicant",
                  status: "new",
                  first_name: "Jane",
                  last_name: "Doe",
                  phone: "+15551234567",
                  email: null,
                  date_of_birth: "1990-05-01",
                  application_data: {},
                  created_at: "2026-06-04T12:00:00Z",
                  updated_at: "2026-06-04T12:00:00Z",
                },
              ],
            };
          }
          return { rows: [] };
        }),
      };
      return fn(client);
    });

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/public/apply/${TOKEN}`,
      payload: {
        first_name: "Jane",
        last_name: "Doe",
        phone: "+15551234567",
        date_of_birth: "1990-05-01",
        fcra_consent: true,
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ applicant: { id: APPLICANT, status: "new" } });
  });

  it("GET /api/v1/identity/applicants lists pipeline applicants", async () => {
    mockWithCurrentUser.mockImplementation(async (_uid: string, fn: (client: { query: ReturnType<typeof vi.fn> }) => Promise<unknown>) =>
      fn(
        officeClient((sql) => {
          if (sql.includes("FROM identity.driver_applicants") && sql.includes("record_kind = 'applicant'")) {
            return {
              rows: [
                {
                  id: APPLICANT,
                  operating_company_id: COMPANY,
                  record_kind: "applicant",
                  status: "screening",
                  first_name: "Jane",
                  last_name: "Doe",
                  phone: "+15551234567",
                  application_data: {},
                  created_at: "2026-06-04T12:00:00Z",
                  updated_at: "2026-06-04T12:00:00Z",
                },
              ],
            };
          }
          return undefined;
        })
      )
    );

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/identity/applicants?operating_company_id=${COMPANY}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { applicants: { id: string }[] };
    expect(body.applicants).toHaveLength(1);
    expect(body.applicants[0].id).toBe(APPLICANT);
  });

  it("POST /api/v1/identity/applicants/:id/convert-to-driver bridges onboarding wizard", async () => {
    mockWithCurrentUser.mockImplementation(async (_uid: string, fn: (client: { query: ReturnType<typeof vi.fn> }) => Promise<unknown>) =>
      fn(
        officeClient((sql) => {
          if (sql.includes("FROM identity.driver_applicants") && sql.includes("LIMIT 1")) {
            return {
              rows: [
                {
                  id: APPLICANT,
                  operating_company_id: COMPANY,
                  record_kind: "applicant",
                  status: "offer",
                  first_name: "Jane",
                  last_name: "Doe",
                  phone: "+15551234567",
                  email: "jane@example.com",
                  cdl_number: "TX123",
                  cdl_state: "TX",
                  converted_driver_id: null,
                  application_data: {},
                },
              ],
            };
          }
          if (sql.includes("FROM identity.users")) return { rows: [] };
          if (sql.includes("INSERT INTO identity.users")) return { rows: [{ id: "u1111111-1111-4111-8111-111111111111" }] };
          if (sql.includes("INSERT INTO mdata.drivers")) return { rows: [{ id: DRIVER }] };
          if (sql.includes("INSERT INTO safety.onboarding_sessions")) return { rows: [{ id: SESSION }] };
          if (sql.includes("UPDATE identity.driver_applicants") && sql.includes("converted_driver_id")) {
            return {
              rows: [
                {
                  id: APPLICANT,
                  operating_company_id: COMPANY,
                  record_kind: "applicant",
                  status: "hired",
                  first_name: "Jane",
                  last_name: "Doe",
                  phone: "+15551234567",
                  converted_driver_id: DRIVER,
                  onboarding_session_id: SESSION,
                  application_data: {},
                  created_at: "2026-06-04T12:00:00Z",
                  updated_at: "2026-06-04T12:00:00Z",
                },
              ],
            };
          }
          return { rows: [], rowCount: 0 };
        })
      )
    );

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/identity/applicants/${APPLICANT}/convert-to-driver?operating_company_id=${COMPANY}`,
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { driver_id: string; onboarding_session_id: string; onboarding_path: string };
    expect(body.driver_id).toBe(DRIVER);
    expect(body.onboarding_session_id).toBe(SESSION);
    expect(body.onboarding_path).toBe(`/drivers/onboarding/${SESSION}`);
  });
});
