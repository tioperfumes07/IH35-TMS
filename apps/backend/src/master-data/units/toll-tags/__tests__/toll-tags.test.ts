import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isLowBalance } from "../service.js";
import { registerUnitTollTagsRoutes } from "../routes.js";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const UNIT = "22222222-2222-4222-8222-222222222222";
const TAG = "44444444-4444-4444-8444-444444444444";

const { mockQuery, mockWithCurrentUser, mockAppendCrudAudit } = vi.hoisted(() => {
  const query = vi.fn();
  const withCurrentUser = vi.fn(async (_userId: string, fn: (client: { query: typeof query }) => Promise<unknown>) =>
    fn({ query })
  );
  const appendCrudAudit = vi.fn(async () => undefined);
  return { mockQuery: query, mockWithCurrentUser: withCurrentUser, mockAppendCrudAudit: appendCrudAudit };
});

vi.mock("../../../../auth/db.js", () => ({
  withCurrentUser: mockWithCurrentUser,
}));

vi.mock("../../../../auth/session-middleware.js", () => ({
  requireAuth: () => true,
}));

vi.mock("../../../../audit/crud-audit.js", () => ({
  appendCrudAudit: mockAppendCrudAudit,
}));

describe("isLowBalance", () => {
  it("flags balances below threshold", () => {
    expect(isLowBalance("10.00")).toBe(true);
    expect(isLowBalance("50.00")).toBe(false);
    expect(isLowBalance(null)).toBe(false);
  });
});

describe("unit toll tag routes (GAP-85)", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    mockQuery.mockReset();
    mockAppendCrudAudit.mockClear();
    app = Fastify({ logger: false });
    app.decorateRequest("user", null);
    app.addHook("preHandler", async (req) => {
      req.user = {
        uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        role: "Manager",
        email: "fleet@ih35.local",
      };
    });
    await registerUnitTollTagsRoutes(app);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("GET /api/units/:unit_uuid/toll-tags returns tags and low balance list", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("FROM mdata.units")) return { rows: [{ id: UNIT }] };
      if (sql.includes("FROM master_data.unit_toll_tags")) {
        return {
          rows: [
            {
              uuid: TAG,
              operating_company_id: COMPANY,
              unit_uuid: UNIT,
              tag_network: "txtag",
              tag_number: "TX-100",
              activated_at: "2026-01-01",
              deactivated_at: null,
              monthly_fee: "5.00",
              balance_current: "12.50",
              auto_replenish: true,
              notes: null,
              deleted_at: null,
              created_at: "2026-01-01T00:00:00.000Z",
              updated_at: "2026-01-01T00:00:00.000Z",
            },
          ],
        };
      }
      return { rows: [] };
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/units/${UNIT}/toll-tags?operating_company_id=${COMPANY}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.toll_tags).toHaveLength(1);
    expect(body.low_balance_tags).toHaveLength(1);
  });

  it("PATCH /api/units/:unit_uuid/toll-tags/:uuid updates balance", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("UPDATE master_data.unit_toll_tags")) {
        return {
          rows: [
            {
              uuid: TAG,
              operating_company_id: COMPANY,
              unit_uuid: UNIT,
              tag_network: "txtag",
              tag_number: "TX-100",
              activated_at: "2026-01-01",
              deactivated_at: null,
              monthly_fee: "5.00",
              balance_current: "80.00",
              auto_replenish: true,
              notes: null,
              deleted_at: null,
              created_at: "2026-01-01T00:00:00.000Z",
              updated_at: "2026-01-02T00:00:00.000Z",
            },
          ],
        };
      }
      return { rows: [] };
    });

    const res = await app.inject({
      method: "PATCH",
      url: `/api/units/${UNIT}/toll-tags/${TAG}?operating_company_id=${COMPANY}`,
      payload: { balance_current: 80 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ balance_current: "80.00" });
  });

  it("DELETE /api/units/:unit_uuid/toll-tags/:uuid soft-deletes only", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("SET deleted_at = now()")) return { rows: [{ uuid: TAG }] };
      return { rows: [] };
    });

    const res = await app.inject({
      method: "DELETE",
      url: `/api/units/${UNIT}/toll-tags/${TAG}?operating_company_id=${COMPANY}`,
    });
    expect(res.statusCode).toBe(200);
    const deleteSql = String(mockQuery.mock.calls.find((c) => String(c[0]).includes("SET deleted_at"))?.[0] ?? "");
    expect(deleteSql).not.toMatch(/\bDELETE\s+FROM\b/i);
  });
});
