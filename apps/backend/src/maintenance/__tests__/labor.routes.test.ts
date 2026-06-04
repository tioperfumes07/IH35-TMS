import Fastify, { type FastifyInstance } from "fastify";
import { describe, expect, it, vi } from "vitest";
import {
  assertManualRange,
  computeLaborCostCents,
  laborCodeRateCentsPerHour,
  mapLaborTimeEntryRow,
  parseLaborNotes,
  registerMaintenanceLaborRoutes,
} from "../labor.routes.js";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const CODE_ID = "33333333-3333-4333-8333-333333333333";

const { mockQuery, mockWithCompanyScope } = vi.hoisted(() => {
  const query = vi.fn();
  return {
    mockQuery: query,
    mockWithCompanyScope: vi.fn(async (_userId: string, _companyId: string, fn: (client: { query: typeof query }) => Promise<unknown>) => fn({ query })),
  };
});

vi.mock("../../auth/session-middleware.js", () => ({ requireAuth: () => true }));
vi.mock("../../accounting/shared.js", () => ({
  companyQuerySchema: {
    safeParse: (v: unknown) => ({
      success: true,
      data: { operating_company_id: String((v as { operating_company_id?: string }).operating_company_id ?? COMPANY) },
    }),
  },
  validationError: () => undefined,
  withCompanyScope: mockWithCompanyScope,
}));

describe("maintenance labor helpers (B34)", () => {
  it("computes labor cost from rate and duration", () => {
    expect(computeLaborCostCents(60, 5000)).toBe(5000);
  });

  it("parses labor notes metadata and maps running cost", () => {
    const encoded = "ih35-labor-meta:" + JSON.stringify({ labor_code_id: CODE_ID, text: "Brake pad swap" });
    expect(parseLaborNotes(encoded).labor_code_id).toBe(CODE_ID);
    const mapped = mapLaborTimeEntryRow({ started_at: "2026-06-04T12:00:00.000Z", ended_at: null, labor_rate_cents_per_hour: 6000, notes: encoded });
    expect(mapped.is_running).toBe(true);
    expect(typeof mapped.computed_labor_cost_cents).toBe("number");
  });

  it("reads default labor rate from catalog metadata", () => {
    expect(laborCodeRateCentsPerHour({ rate_cents_per_hour: 7500 })).toBe(7500);
    expect(assertManualRange("2026-05-01T12:00:00.000Z", "2026-05-01T13:00:00.000Z")).toBe(true);
  });

  it("registers labor codes list route", async () => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValueOnce({ rows: [{ ok: true }] }).mockResolvedValueOnce({
      rows: [{ id: CODE_ID, code: "PM-SERVICE", display_name: "PM service", metadata: { rate_cents_per_hour: 5500 }, is_active: true, sort_order: 10 }],
    });
    const app: FastifyInstance = Fastify();
    app.addHook("preHandler", async (req) => {
      (req as { user?: { uuid: string } }).user = { uuid: "user-test-1" };
    });
    await registerMaintenanceLaborRoutes(app);
    const res = await app.inject({ method: "GET", url: `/api/v1/maintenance/labor-codes?operating_company_id=${COMPANY}` });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { labor_codes: Array<{ rate_cents_per_hour: number }> }).labor_codes[0]?.rate_cents_per_hour).toBe(5500);
    await app.close();
  });
});
