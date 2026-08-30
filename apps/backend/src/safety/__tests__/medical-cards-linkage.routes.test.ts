import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerSafetyMedicalCardsRoutes } from "../medical-cards.routes.js";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const DRIVER = "22222222-2222-4222-8222-222222222222";

const { mockQuery, mockAudit } = vi.hoisted(() => ({ mockQuery: vi.fn(), mockAudit: vi.fn() }));
vi.mock("../../auth/db.js", () => ({ withCurrentUser: vi.fn(async (_id: string, fn: (client: { query: typeof mockQuery }) => unknown) => fn({ query: mockQuery })) }));
vi.mock("../../auth/session-middleware.js", () => ({ requireAuth: () => true }));
vi.mock("../../_helpers/company-membership-guard.js", () => ({ assertCompanyMembership: vi.fn(async () => undefined) }));
vi.mock("../../audit/crud-audit.js", () => ({ appendCrudAudit: mockAudit }));

describe("medical-card driver linkage", () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    mockQuery.mockReset();
    mockAudit.mockReset();
    app = Fastify({ logger: false });
    app.decorateRequest("user", null);
    app.addHook("preHandler", async (req) => { req.user = { uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", role: "Safety", email: "safety@test.local" }; });
    await registerSafetyMedicalCardsRoutes(app);
    await app.ready();
  });
  afterEach(async () => { await app.close(); });

  it("returns a labeled, exact-driver company-scoped reverse list", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT 1 FROM mdata.drivers d")) return { rows: [{ exists: 1 }] };
      if (sql.includes("FROM safety.medical_cards mc")) {
        return { rows: [{ id: "card-1", driver_id: DRIVER, driver_name: "Alicia Vance", expiry_date: "2027-01-01", days_to_expiry: 100 }] };
      }
      return { rows: [] };
    });
    const response = await app.inject({ method: "GET", url: `/api/v1/safety/medical-cards?operating_company_id=${COMPANY}&driver_id=${DRIVER}` });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ cards: [{ driver_id: DRIVER, driver_name: "Alicia Vance" }] });
    const listCall = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes("SELECT mc.*") && String(sql).includes("FROM safety.medical_cards mc")
    );
    expect(String(listCall?.[0])).toMatch(/d\.operating_company_id = mc\.operating_company_id/);
    expect(String(listCall?.[0])).toMatch(/label_dca\.company_id = mc\.operating_company_id/);
    expect(String(listCall?.[0])).toMatch(/label_dca\.is_authorized = true/);
    expect(String(listCall?.[0])).toMatch(/label_dca\.deactivated_at IS NULL/);
    expect(String(listCall?.[0])).toMatch(/mc\.driver_id = \$2::uuid/);
    expect(listCall?.[1]).toEqual([COMPANY, DRIVER, 50, 0]);
  });

  it("validates driver company ownership before inserting and audits the FK", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT id FROM mdata.drivers")) return { rows: [{ id: DRIVER }] };
      if (sql.includes("INSERT INTO safety.medical_cards")) return { rows: [{ id: "card-2", driver_id: DRIVER }] };
      return { rows: [] };
    });
    const response = await app.inject({ method: "POST", url: `/api/v1/safety/medical-cards?operating_company_id=${COMPANY}`, payload: { driver_id: DRIVER, card_number: "MC-22", issued_date: "2026-08-01", expiry_date: "2027-08-01" } });
    expect(response.statusCode).toBe(201);
    expect(mockAudit).toHaveBeenCalledWith(expect.anything(), expect.anything(), "safety.medical_card.created", expect.objectContaining({ operating_company_id: COMPANY, driver_id: DRIVER }), "info", "P7-SAF-DRIVER-MED");
  });

  it("rejects a driver outside the selected operating company", async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const response = await app.inject({ method: "POST", url: `/api/v1/safety/medical-cards?operating_company_id=${COMPANY}`, payload: { driver_id: DRIVER, card_number: "MC-22", issued_date: "2026-08-01", expiry_date: "2027-08-01" } });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "driver_not_in_operating_company" });
    expect(mockQuery.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO safety.medical_cards"))).toBe(false);
  });
});
