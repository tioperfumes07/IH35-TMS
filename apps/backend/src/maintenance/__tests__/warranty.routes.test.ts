import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  computeWarrantyExpiry,
  detectWarrantyEligiblePartsFromWorkOrder,
  mapWarrantyClaimRow,
  registerMaintenanceWarrantyRoutes,
  warrantyClaimStatusLabel,
} from "../warranty.routes.js";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const CLAIM_ID = "22222222-2222-4222-8222-222222222222";
const WO_ID = "33333333-3333-4333-8333-333333333333";
const WARRANTY_ID = "44444444-4444-4444-8444-444444444444";

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

function sampleClaim(overrides: Record<string, unknown> = {}) {
  return {
    id: CLAIM_ID,
    operating_company_id: COMPANY,
    parts_warranty_id: WARRANTY_ID,
    work_order_id: WO_ID,
    vendor_id: null,
    vendor_name: "Fleet Parts Co",
    claim_number: "WC-100",
    status: "draft",
    part_description: "Alternator",
    claim_amount_cents: 45000,
    reimbursement_amount_cents: null,
    filed_at: null,
    reimbursement_received_at: null,
    notes: "",
    auto_detected: false,
    archived_at: null,
    archive_reason: null,
    created_at: "2026-06-04T08:00:00Z",
    updated_at: "2026-06-04T08:00:00Z",
    ...overrides,
  };
}

describe("maintenance warranty helpers (B33)", () => {
  it("maps warranty claim status labels", () => {
    expect(warrantyClaimStatusLabel("draft")).toBe("Draft");
    expect(warrantyClaimStatusLabel("reimbursed")).toBe("Reimbursed");
  });

  it("computes warranty expiry from purchase date and months", () => {
    expect(computeWarrantyExpiry("2026-01-15", 12)).toBe("2027-01-15");
  });

  it("maps warranty claim row with status label", () => {
    const mapped = mapWarrantyClaimRow(sampleClaim({ status: "filed" }));
    expect(mapped.status_label).toBe("Filed");
    expect(mapped.claim_amount_cents).toBe(45000);
  });

  it("detects eligible parts from work order lines with active warranty", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM maintenance.work_orders")) {
        return { rows: [{ id: WO_ID, vendor_id: null, external_vendor_id: null }] };
      }
      if (sql.includes("FROM maintenance.work_order_lines")) {
        return {
          rows: [{ id: "line-1", line_type: "parts", description: "Alternator", total_cost: 450, part_uuid: null }],
        };
      }
      if (sql.includes("FROM maintenance.parts_warranty")) {
        return {
          rows: [
            {
              id: WARRANTY_ID,
              part_description: "Alternator",
              vendor_id: null,
              expires_at: "2027-06-01",
              warranty_months: 12,
              parts_inventory_id: null,
              vendor_name: null,
            },
          ],
        };
      }
      return { rows: [] };
    });

    const result = await detectWarrantyEligiblePartsFromWorkOrder({ query: mockQuery }, COMPANY, WO_ID);
    expect(result.eligible).toHaveLength(1);
    expect(result.eligible[0]).toMatchObject({ parts_warranty_id: WARRANTY_ID });
  });
});

describe("maintenance warranty routes (B33)", () => {
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
    await registerMaintenanceWarrantyRoutes(app);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("GET /api/v1/maintenance/warranty/claims lists active claims", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("set_config")) return { rows: [] };
      return { rows: [sampleClaim()], rowCount: 1 };
    });
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/maintenance/warranty/claims?operating_company_id=${COMPANY}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      rows: [{ id: CLAIM_ID, status_label: "Draft" }],
    });
  });

  it("POST /api/v1/maintenance/warranty/claims creates draft claim", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("INSERT INTO maintenance.warranty_claims")) return { rows: [{ id: CLAIM_ID }] };
      return { rows: [sampleClaim()], rowCount: 1 };
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/maintenance/warranty/claims",
      payload: {
        operating_company_id: COMPANY,
        part_description: "Alternator",
        claim_amount_cents: 45000,
      },
    });
    expect(res.statusCode).toBe(201);
    expect(mockAppendCrudAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      "maintenance.warranty_claim.created",
      expect.objectContaining({ part_description: "Alternator" })
    );
  });

  it("POST /api/v1/maintenance/warranty/claims/:id/file marks claim filed", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("UPDATE maintenance.warranty_claims")) return { rows: [], rowCount: 1 };
      return { rows: [sampleClaim({ status: "filed", filed_at: "2026-06-04T09:00:00Z" })], rowCount: 1 };
    });
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/maintenance/warranty/claims/${CLAIM_ID}/file`,
      payload: {
        operating_company_id: COMPANY,
        claim_number: "WC-200",
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: "filed", status_label: "Filed" });
  });

  it("POST /api/v1/maintenance/warranty/detect-from-wo returns eligible parts", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("FROM maintenance.work_orders")) {
        return { rows: [{ id: WO_ID, vendor_id: null, external_vendor_id: null }] };
      }
      if (sql.includes("FROM maintenance.work_order_lines")) {
        return {
          rows: [{ id: "line-1", line_type: "parts", description: "Alternator", total_cost: 450, part_uuid: null }],
        };
      }
      if (sql.includes("FROM maintenance.parts_warranty")) {
        return {
          rows: [
            {
              id: WARRANTY_ID,
              part_description: "Alternator",
              vendor_id: null,
              expires_at: "2027-06-01",
              warranty_months: 12,
              parts_inventory_id: null,
              vendor_name: null,
            },
          ],
        };
      }
      return { rows: [] };
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/maintenance/warranty/detect-from-wo",
      payload: {
        operating_company_id: COMPANY,
        work_order_id: WO_ID,
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ work_order_id: WO_ID, eligible: [{ parts_warranty_id: WARRANTY_ID }] });
  });
});
