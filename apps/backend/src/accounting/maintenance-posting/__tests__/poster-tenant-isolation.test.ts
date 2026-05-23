import { describe, expect, it, vi } from "vitest";
import { processMaintenanceWorkOrderClose } from "../poster.service.js";

const { mockQuery, mockWithLuciaBypass, mockResolveAccountForCategory, mockPostSourceTransaction, mockEnqueueTmsBillPushRequested } =
  vi.hoisted(() => {
    const query = vi.fn();
    const withLuciaBypass = vi.fn(async (fn: (client: { query: typeof query }) => unknown) => fn({ query }));
    const resolveAccountForCategory = vi.fn();
    const postSourceTransaction = vi.fn();
    const enqueueTmsBillPushRequested = vi.fn();
    return {
      mockQuery: query,
      mockWithLuciaBypass: withLuciaBypass,
      mockResolveAccountForCategory: resolveAccountForCategory,
      mockPostSourceTransaction: postSourceTransaction,
      mockEnqueueTmsBillPushRequested: enqueueTmsBillPushRequested,
    };
  });

vi.mock("../../../auth/db.js", () => ({
  withLuciaBypass: mockWithLuciaBypass,
}));

vi.mock("../../expense-category-map/resolver.service.js", () => ({
  resolveAccountForCategory: mockResolveAccountForCategory,
  ExpenseCategoryMapResolutionError: class ExpenseCategoryMapResolutionError extends Error {},
}));

vi.mock("../../posting-engine.service.js", () => ({
  postSourceTransaction: mockPostSourceTransaction,
  PostingEngineError: class PostingEngineError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
}));

vi.mock("../../../qbo/tms-bill-push-chain.service.js", () => ({
  enqueueTmsBillPushRequested: mockEnqueueTmsBillPushRequested,
}));

describe("maintenance posting tenant isolation", () => {
  it("scopes lookups by operating_company_id and sets tenant context", async () => {
    mockQuery.mockReset();
    mockResolveAccountForCategory.mockReset();
    mockPostSourceTransaction.mockReset();

    mockResolveAccountForCategory.mockResolvedValue({
      account_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      posting_side: "debit",
    });
    mockPostSourceTransaction.mockResolvedValue({
      result: "posted",
      posting_batch_id: "pb-3",
    });

    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM maintenance.work_orders") && sql.includes("status::text")) {
        return {
          rows: [
            {
              id: "wo-1",
              status: "complete",
              vendor_id: "vendor-1",
              external_vendor_id: null,
              total_actual_cost: "100.00",
              display_id: "WO-102",
            },
          ],
        };
      }
      if (sql.includes("FROM accounting.bills") && sql.includes("linked_work_order_uuid")) return { rows: [{ id: "bill-tenant" }] };
      if (sql.includes("FROM maintenance.work_orders") && sql.includes("wo_service_class")) {
        return { rows: [{ wo_type: "repair", wo_service_class: "corrective", description: "Electrical issue" }] };
      }
      if (sql.includes("FROM maintenance.work_order_lines")) {
        return {
          rows: [
            {
              wo_line_uuid: "line-1",
              line_type: "labor",
              description: "Electrical harness labor",
              amount: "100.00",
              section: "B",
              expense_category_uuid: null,
              service_item_uuid: null,
              part_uuid: null,
              labor_rate_uuid: null,
              part_location_codes: null,
            },
          ],
        };
      }
      if (sql.includes("FROM accounting.bill_lines") && sql.includes("linked_wo_line_uuid")) return { rows: [] };
      if (sql.includes("FROM information_schema.columns") && sql.includes("table_name = 'bill_lines'")) {
        return {
          rows: [
            { column_name: "bill_id" },
            { column_name: "line_sequence" },
            { column_name: "amount" },
            { column_name: "description" },
            { column_name: "linked_wo_line_uuid" },
            { column_name: "account_id" },
          ],
        };
      }
      if (sql.includes("SELECT COALESCE(MAX(line_sequence), 0)::int AS max_line_sequence")) return { rows: [{ max_line_sequence: 0 }] };
      if (sql.includes("SELECT COALESCE(SUM(amount), 0)::text AS total_amount")) return { rows: [{ total_amount: "100.00" }] };
      return { rows: [] };
    });

    await processMaintenanceWorkOrderClose({
      operating_company_id: "11111111-1111-4111-8111-111111111111",
      work_order_id: "22222222-2222-4222-8222-222222222222",
      actor_user_id: "33333333-3333-4333-8333-333333333333",
    });

    const setConfigCall = mockQuery.mock.calls.find(([sql]) => String(sql).includes("set_config('app.operating_company_id'"));
    expect(setConfigCall?.[1]).toEqual(["11111111-1111-4111-8111-111111111111"]);

    const workOrderLookupSql = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes("FROM maintenance.work_orders") && String(sql).includes("status::text")
    )?.[0];
    expect(String(workOrderLookupSql)).toContain("operating_company_id = $2::uuid");

    const linkedBillLookupSql = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes("FROM accounting.bills") && String(sql).includes("linked_work_order_uuid")
    )?.[0];
    expect(String(linkedBillLookupSql)).toContain("operating_company_id = $1::uuid");
  });
});
