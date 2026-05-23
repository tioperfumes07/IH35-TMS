import type { FastifyInstance } from "fastify";
import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerExpenseCategoryMapRoutes } from "../routes.js";

const { mockQuery, mockWithCompanyScope } = vi.hoisted(() => {
  const query = vi.fn();
  const withCompanyScope = vi.fn(async (_userId: string, _companyId: string, fn: (client: { query: typeof query }) => unknown) =>
    fn({ query }),
  );
  return { mockQuery: query, mockWithCompanyScope: withCompanyScope };
});

vi.mock("../../shared.js", () => ({
  currentAuthUser: () => ({ uuid: "f47ac10b-58cc-4372-a567-0e02b2c3d479", role: "Accountant" }),
  validationError: (reply: { code: (status: number) => { send: (payload: unknown) => unknown } }) =>
    reply.code(400).send({ error: "validation_error" }),
  withCompanyScope: mockWithCompanyScope,
}));

describe("expense-category-map.routes tenant isolation", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    mockQuery.mockReset();
    mockWithCompanyScope.mockClear();
    app = Fastify({ logger: false });
    await registerExpenseCategoryMapRoutes(app);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("refuses create when payload tenant is outside caller access", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/accounting/expense-category-map",
      headers: { "content-type": "application/json" },
      payload: {
        operating_company_id: "22222222-2222-4222-8222-222222222222",
        category_kind: "fuel",
        category_code: "DIESEL",
        account_id: "33333333-3333-4333-8333-333333333333",
        posting_side: "debit",
      },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: "forbidden" });
  });

  it("creates mapping in matching tenant and writes audit event", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "99999999-9999-4999-8999-999999999999",
            operating_company_id: "11111111-1111-4111-8111-111111111111",
            category_kind: "fuel",
            category_code: "DIESEL",
            account_id: "33333333-3333-4333-8333-333333333333",
            posting_side: "debit",
            is_active: true,
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/accounting/expense-category-map",
      headers: { "content-type": "application/json" },
      payload: {
        operating_company_id: "11111111-1111-4111-8111-111111111111",
        category_kind: "fuel",
        category_code: "DIESEL",
        account_id: "33333333-3333-4333-8333-333333333333",
        posting_side: "debit",
      },
    });

    expect(res.statusCode).toBe(201);
    const auditCall = mockQuery.mock.calls.find((call) => String(call[0]).includes("audit.append_event"));
    expect(auditCall).toBeTruthy();
    expect(JSON.parse(String(auditCall?.[1]?.[2]))).toMatchObject({
      action: "create",
      category_kind: "fuel",
      category_code: "DIESEL",
      account_id: "33333333-3333-4333-8333-333333333333",
    });
  });
});
