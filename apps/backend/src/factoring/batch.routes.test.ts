import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerFactoringBatchRoutes } from "./batch.routes.js";
import { calculateBatchTotals, createDraftBatch, FactoringBatchError, submitBatch } from "./batch.service.js";

const requireAuthState = { allowed: true };

const batchTenant = "11111111-1111-4111-8111-111111111111";
const batchId = "33333333-3333-4333-8333-333333333333";
const invoiceA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const invoiceB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const queryMock = vi.fn(async (sql: string, values?: unknown[]) => {
  if (sql.includes("set_config('app.operating_company_id'")) return { rows: [] };

  if (sql.includes("FROM accounting.invoices i") && sql.includes("COALESCE(i.factoring_status, 'not_factored') = 'not_factored'")) {
    const ids = (values?.[1] as string[]) ?? [];
    const rows = ids
      .filter((id) => id !== "ffffffff-ffff-4fff-8fff-ffffffffffff")
      .map((id, index) => ({
        id,
        total_cents: index === 0 ? 100000 : 50000,
      }));
    return { rows };
  }

  if (sql.includes("INSERT INTO factoring.batch")) {
    return {
      rows: [
        {
          id: batchId,
          tenant_id: String(values?.[0] ?? batchTenant),
          batch_number: String(values?.[1] ?? "BATCH-TEST-001"),
          status: "draft",
          invoice_ids: values?.[2] ?? [],
          total_face_cents: Number(values?.[3] ?? 0),
          advance_rate: String(values?.[4] ?? "0.95"),
          expected_advance_cents: Number(values?.[5] ?? 0),
          fee_rate: String(values?.[6] ?? "0.025"),
          expected_fee_cents: Number(values?.[7] ?? 0),
          submitted_at: null,
          funded_at: null,
          factor_id: null,
        },
      ],
    };
  }

  if (sql.includes("SELECT id::text, status") && sql.includes("FROM factoring.batch")) {
    const id = String(values?.[0] ?? "");
    if (id === "99999999-9999-4999-8999-999999999999") return { rows: [] };
    if (id === "77777777-7777-4777-8777-777777777777") return { rows: [{ id, status: "submitted" }] };
    return { rows: [{ id, status: "draft" }] };
  }

  if (sql.includes("UPDATE factoring.batch") && sql.includes("SET status = 'submitted'")) {
    return {
      rows: [
        {
          id: String(values?.[0] ?? batchId),
          tenant_id: String(values?.[1] ?? batchTenant),
          batch_number: "BATCH-TEST-001",
          status: "submitted",
          invoice_ids: [invoiceA, invoiceB],
          total_face_cents: 150000,
          advance_rate: "0.95",
          expected_advance_cents: 142500,
          fee_rate: "0.025",
          expected_fee_cents: 3750,
          submitted_at: "2026-05-30T00:00:00.000Z",
          funded_at: null,
          factor_id: null,
        },
      ],
    };
  }

  if (sql.includes("SELECT *") && sql.includes("FROM factoring.batch") && sql.includes("ORDER BY COALESCE(submitted_at, funded_at)")) {
    return {
      rows: [
        {
          id: batchId,
          tenant_id: String(values?.[0] ?? batchTenant),
          batch_number: "BATCH-TEST-001",
          status: "draft",
          invoice_ids: [invoiceA, invoiceB],
          total_face_cents: 150000,
          advance_rate: "0.95",
          expected_advance_cents: 142500,
          fee_rate: "0.025",
          expected_fee_cents: 3750,
          submitted_at: null,
          funded_at: null,
          factor_id: null,
        },
      ],
    };
  }

  if (sql.includes("SELECT *") && sql.includes("FROM factoring.batch") && sql.includes("WHERE id = $1::uuid")) {
    const id = String(values?.[0] ?? "");
    if (id === "99999999-9999-4999-8999-999999999999") return { rows: [] };
    return {
      rows: [
        {
          id,
          tenant_id: String(values?.[1] ?? batchTenant),
          batch_number: "BATCH-TEST-001",
          status: "submitted",
          invoice_ids: [invoiceA, invoiceB],
          total_face_cents: 150000,
          advance_rate: "0.95",
          expected_advance_cents: 142500,
          fee_rate: "0.025",
          expected_fee_cents: 3750,
          submitted_at: "2026-05-30T00:00:00.000Z",
          funded_at: null,
          factor_id: null,
        },
      ],
    };
  }

  if (sql.includes("FROM unnest($1::uuid[]) WITH ORDINALITY")) {
    return {
      rows: [
        {
          id: invoiceA,
          display_id: "INV-1001",
          customer_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          customer_name: "Acme Logistics",
          issue_date: "2026-05-01",
          due_date: "2026-05-31",
          status: "paid",
          total_cents: 100000,
        },
        {
          id: invoiceB,
          display_id: "INV-1002",
          customer_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
          customer_name: "Blue Trucking",
          issue_date: "2026-05-03",
          due_date: "2026-06-02",
          status: "paid",
          total_cents: 50000,
        },
      ],
    };
  }

  if (sql.includes("/candidate-invoices")) return { rows: [] };

  return { rows: [] };
});

vi.mock("../auth/session-middleware.js", () => ({
  requireAuth: (_req: unknown, reply: { code: (statusCode: number) => { send: (body: unknown) => void } }) => {
    if (requireAuthState.allowed) return true;
    reply.code(401).send({ error: "unauthorized" });
    return false;
  },
}));

vi.mock("../auth/db.js", () => ({
  withCurrentUser: async (_userId: string, fn: (client: { query: typeof queryMock }) => Promise<unknown>) => fn({ query: queryMock }),
}));

vi.mock("../_helpers/company-membership-guard.js", () => ({
  assertCompanyMembership: async () => {},
}));

describe("factoring batch service", () => {
  beforeEach(() => {
    queryMock.mockClear();
  });

  it("calculateBatchTotals computes face/advance/fee correctly", () => {
    const totals = calculateBatchTotals(
      [
        { id: invoiceA, total_cents: 100000 },
        { id: invoiceB, total_cents: 50000 },
      ],
      0.95,
      0.025
    );
    expect(totals).toEqual({
      total_face_cents: 150000,
      expected_advance_cents: 142500,
      expected_fee_cents: 3750,
    });
  });

  it("createDraftBatch supports multiple invoices", async () => {
    const row = await createDraftBatch(batchTenant, [invoiceA, invoiceB], {
      client: { query: queryMock },
      now: new Date("2026-05-30T12:00:00.000Z"),
    });
    expect(row.status).toBe("draft");
    expect(row.invoice_ids).toEqual([invoiceA, invoiceB]);
    expect(row.total_face_cents).toBe(150000);
    expect(row.expected_advance_cents).toBe(142500);
    expect(row.expected_fee_cents).toBe(3750);
  });

  it("submitBatch rejects submitted -> submitted transition", async () => {
    await expect(
      submitBatch("77777777-7777-4777-8777-777777777777", batchTenant, { client: { query: queryMock } })
    ).rejects.toMatchObject<FactoringBatchError>({
      code: "batch_already_submitted",
    });
  });
});

describe("factoring batch routes", () => {
  const apps: Array<ReturnType<typeof Fastify>> = [];

  beforeEach(() => {
    requireAuthState.allowed = true;
    queryMock.mockClear();
  });

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  async function buildApp(role = "Owner") {
    const app = Fastify();
    apps.push(app);
    app.decorateRequest("user", null);
    app.addHook("preHandler", async (req) => {
      (req as unknown as { user: { uuid: string; role: string } }).user = {
        uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        role,
      };
    });
    await registerFactoringBatchRoutes(app);
    return app;
  }

  it("POST creates draft batch with multiple invoices", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/factoring/batches",
      payload: {
        operating_company_id: batchTenant,
        invoice_ids: [invoiceA, invoiceB],
      },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      status: "draft",
      total_face_cents: 150000,
      expected_advance_cents: 142500,
      expected_fee_cents: 3750,
    });
  });

  it("POST submit transitions draft -> submitted", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/factoring/batches/${batchId}/submit?operating_company_id=${batchTenant}`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: batchId,
      status: "submitted",
    });
  });

  it("tenant isolation returns not found", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/factoring/batches/99999999-9999-4999-8999-999999999999/submit?operating_company_id=${batchTenant}`,
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: "batch_not_found" });
  });
});

