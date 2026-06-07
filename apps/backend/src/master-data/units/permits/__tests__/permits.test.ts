import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildPermitExpiryAlert, scanUnitPermitExpiries } from "../service.js";
import { registerUnitPermitsRoutes } from "../routes.js";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const UNIT = "22222222-2222-4222-8222-222222222222";
const PERMIT = "33333333-3333-4333-8333-333333333333";

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

describe("buildPermitExpiryAlert", () => {
  it("maps permit rows to severity using cert-monitor thresholds", () => {
    const reference = new Date("2026-06-01T00:00:00.000Z");
    const critical = buildPermitExpiryAlert(
      {
        uuid: PERMIT,
        unit_uuid: UNIT,
        permit_type: "hazmat",
        expiration_date: "2026-06-10",
        operating_company_id: COMPANY,
        unit_number: "U-101",
      },
      reference
    );
    expect(critical?.severity).toBe("critical");
    expect(critical?.days_until_expiry).toBe(9);
  });
});

describe("scanUnitPermitExpiries", () => {
  it("excludes soft-deleted permits from scan query", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    await scanUnitPermitExpiries({ query }, COMPANY);
    expect(query).toHaveBeenCalledOnce();
    expect(String(query.mock.calls[0]?.[0])).toContain("deleted_at IS NULL");
  });
});

describe("unit permits routes (GAP-85)", () => {
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
    await registerUnitPermitsRoutes(app);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("GET /api/units/:unit_uuid/permits lists active permits", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("FROM mdata.units")) return { rows: [{ id: UNIT }] };
      if (sql.includes("FROM master_data.unit_permits") && sql.includes("deleted_at IS NULL")) {
        return {
          rows: [
            {
              uuid: PERMIT,
              operating_company_id: COMPANY,
              unit_uuid: UNIT,
              permit_type: "oversize",
              issuing_state: "TX",
              permit_number: "OS-1",
              effective_date: "2026-01-01",
              expiration_date: "2026-12-31",
              cost: "150.00",
              notes: null,
              pdf_evidence_uuid: null,
              deleted_at: null,
              created_at: "2026-01-01T00:00:00.000Z",
              updated_at: "2026-01-01T00:00:00.000Z",
            },
          ],
        };
      }
      if (sql.includes("JOIN mdata.units")) return { rows: [] };
      return { rows: [] };
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/units/${UNIT}/permits?operating_company_id=${COMPANY}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().permits).toHaveLength(1);
  });

  it("POST /api/units/:unit_uuid/permits creates permit", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("FROM mdata.units")) return { rows: [{ id: UNIT }] };
      if (sql.includes("INSERT INTO master_data.unit_permits")) {
        return {
          rows: [
            {
              uuid: PERMIT,
              operating_company_id: COMPANY,
              unit_uuid: UNIT,
              permit_type: "hazmat",
              issuing_state: "TX",
              permit_number: "HZ-9",
              effective_date: "2026-01-01",
              expiration_date: "2026-12-31",
              cost: null,
              notes: null,
              pdf_evidence_uuid: null,
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
      method: "POST",
      url: `/api/units/${UNIT}/permits?operating_company_id=${COMPANY}`,
      payload: {
        permit_type: "hazmat",
        issuing_state: "TX",
        permit_number: "HZ-9",
        effective_date: "2026-01-01",
        expiration_date: "2026-12-31",
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ permit_type: "hazmat" });
  });

  it("DELETE /api/units/:unit_uuid/permits/:uuid soft-deletes only", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("SET deleted_at = now()")) return { rows: [{ uuid: PERMIT }] };
      return { rows: [] };
    });

    const res = await app.inject({
      method: "DELETE",
      url: `/api/units/${UNIT}/permits/${PERMIT}?operating_company_id=${COMPANY}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, uuid: PERMIT });
    const deleteSql = String(mockQuery.mock.calls.find((c) => String(c[0]).includes("SET deleted_at"))?.[0] ?? "");
    expect(deleteSql).toContain("UPDATE master_data.unit_permits");
    expect(deleteSql).not.toMatch(/\bDELETE\s+FROM\b/i);
  });
});
