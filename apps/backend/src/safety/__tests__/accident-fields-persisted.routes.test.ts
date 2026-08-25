import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerSafetyRoutes } from "../safety.routes.js";

/**
 * SAF-F05 — the accident wizard's 7 evidence fields (police report #, external insurer claim #,
 * location, 3rd party name/plate, vendor invoice, bill/expense ref) must reach the DB on create AND
 * patch. Before this they rendered but were discarded. These tests assert the route accepts and WRITES
 * them (the INSERT/UPDATE carries the column + value), so a future regression that drops a field from
 * the SQL is caught.
 */
const COMPANY = "11111111-1111-4111-8111-111111111111";
const ACCIDENT_ID = "22222222-2222-4222-8222-222222222222";
// P44-ACCIDENT-TYPE-FK (PR #5947, migration 202612511400) made accident_type_id a NOT NULL
// same-opco FK on safety.accident_reports — every POST create payload needs one.
const ACCIDENT_TYPE = "66666666-6666-4666-8666-666666666666";
const FOREIGN_DRIVER = "77777777-7777-4777-8777-777777777777";

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));

vi.mock("../../auth/db.js", () => ({
  withCurrentUser: vi.fn(async (_u: string, fn: (c: { query: typeof mockQuery }) => Promise<unknown>) => fn({ query: mockQuery })),
}));
vi.mock("../../auth/session-middleware.js", () => ({ requireAuth: () => true }));
vi.mock("../../_helpers/company-membership-guard.js", () => ({ assertCompanyMembership: vi.fn(async () => undefined) }));
vi.mock("../../audit/crud-audit.js", () => ({
  appendCrudAudit: vi.fn(async () => undefined),
  buildPatchChanges: vi.fn(() => ({})),
}));

const FIELDS = {
  police_report_number: "PR-2026-0099",
  insurance_claim_number: "INS-CLM-771",
  location: "IH-35 mile marker 18, Laredo",
  third_party_name: "Acme Freight LLC",
  third_party_plate: "TX-8891234",
  vendor_invoice_number: "VINV-5567",
  bill_or_expense_ref: "BILL-3321",
};

describe("accident create/patch persists the 7 evidence fields (SAF-F05)", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    mockQuery.mockReset();
    app = Fastify({ logger: false });
    app.decorateRequest("user", null);
    app.addHook("preHandler", async (req) => {
      req.user = { uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", role: "Safety", email: "s@ih35.local" };
    });
    await registerSafetyRoutes(app);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("create: sends every field as an INSERT column + value", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("INSERT INTO safety.accident_reports")) return { rows: [{ id: ACCIDENT_ID }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/safety/accidents",
      payload: { operating_company_id: COMPANY, accident_type_id: ACCIDENT_TYPE, ...FIELDS },
    });
    expect(res.statusCode).toBe(201); // create → 201 Created

    const insert = mockQuery.mock.calls.map(([sql]) => String(sql)).find((s) => s.includes("INSERT INTO safety.accident_reports"));
    expect(insert).toBeDefined();
    const insertCall = mockQuery.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO safety.accident_reports"));
    const params = insertCall?.[1] as unknown[];
    for (const [col, value] of Object.entries(FIELDS)) {
      expect(insert, `INSERT must name ${col}`).toContain(col);
      expect(params, `INSERT params must carry the value for ${col}`).toContain(value);
    }
  });

  it("patch: only-provided fields become SET clauses carrying the value", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT * FROM safety.accident_reports")) return { rows: [{ id: ACCIDENT_ID }], rowCount: 1 };
      if (sql.includes("UPDATE safety.accident_reports")) return { rows: [{ id: ACCIDENT_ID, ...FIELDS }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });

    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/safety/accidents/${ACCIDENT_ID}?operating_company_id=${COMPANY}`,
      payload: { location: FIELDS.location, third_party_name: FIELDS.third_party_name },
    });
    expect(res.statusCode).toBe(200);

    const updateCall = mockQuery.mock.calls.find(([sql]) => String(sql).includes("UPDATE safety.accident_reports"));
    const sql = String(updateCall?.[0]);
    const params = updateCall?.[1] as unknown[];
    expect(sql).toContain("location =");
    expect(sql).toContain("third_party_name =");
    expect(params).toContain(FIELDS.location);
    expect(params).toContain(FIELDS.third_party_name);
    // A field not sent must NOT appear in the SET.
    expect(sql).not.toContain("police_report_number =");
  });

  it("create: rejects a foreign-company linked entity before INSERT", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM mdata.drivers d")) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 0 };
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/safety/accidents",
      payload: { operating_company_id: COMPANY, accident_type_id: ACCIDENT_TYPE, driver_id: FOREIGN_DRIVER },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "accident_link_not_found", fields: ["driver_id"] });
    expect(mockQuery.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO safety.accident_reports"))).toBe(false);
  });

  it("patch: rejects a foreign-company linked entity before UPDATE", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM mdata.drivers d")) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 0 };
    });
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/safety/accidents/${ACCIDENT_ID}?operating_company_id=${COMPANY}`,
      payload: { driver_id: FOREIGN_DRIVER },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "accident_link_not_found", fields: ["driver_id"] });
    expect(mockQuery.mock.calls.some(([sql]) => String(sql).includes("UPDATE safety.accident_reports"))).toBe(false);
  });

  it("spawn-wo: persists the accident insurance claim FK into the AC work order", async () => {
    const claimId = "88888888-8888-4888-8888-888888888888";
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT *") && sql.includes("FROM safety.accident_reports")) {
        return { rows: [{ id: ACCIDENT_ID, unit_id: null, driver_id: null, insurance_claim_id: claimId }], rowCount: 1 };
      }
      if (sql.includes("FROM maintenance.work_orders") && sql.includes("description ILIKE")) return { rows: [], rowCount: 0 };
      if (sql.includes("FROM maintenance.next_wo_display_id")) {
        return { rows: [{ display_id: "AC-20260824-0001", sequence: 1 }], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO maintenance.work_orders")) {
        return { rows: [{ id: "99999999-9999-4999-8999-999999999999", display_id: "AC-20260824-0001" }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/safety/accidents/${ACCIDENT_ID}/spawn-wo?operating_company_id=${COMPANY}`,
    });
    expect(res.statusCode).toBe(200);
    const insert = mockQuery.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO maintenance.work_orders"));
    expect(String(insert?.[0])).toContain("insurance_claim_id");
    expect(insert?.[1]).toContain(claimId);
  });
});
