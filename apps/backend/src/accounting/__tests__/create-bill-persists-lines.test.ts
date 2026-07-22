/**
 * Unit tests for createBill line fail-closed + same-txn bill_lines INSERT (LAW-E2E #3167).
 * Mocks DB / audit / QBO side-effects — does not touch Neon or flip posting flags.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();
const withCurrentUserMock = vi.fn();

vi.mock("../../auth/db.js", () => ({
  withCurrentUser: (userId: string, fn: (client: { query: typeof queryMock }) => Promise<unknown>) =>
    withCurrentUserMock(userId, fn),
  withLuciaBypass: vi.fn(),
}));

vi.mock("../../audit/crud-audit.js", () => ({
  appendCrudAudit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../documents/attachments.service.js", () => ({
  reassignDraftAttachments: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../integrations/qbo/qbo-sync.service.js", () => ({
  enqueueSyncJob: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../qbo/tms-bill-push-chain.service.js", () => ({
  enqueueTmsBillPushRequested: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../bill-gl.service.js", () => ({
  postBillGlIfEnabled: vi.fn().mockResolvedValue({ posted: false, reason: "flag_off" }),
}));

import { createBill } from "../bills.service.js";

describe("createBill — bill_lines persist (LAW-E2E #3167)", () => {
  beforeEach(() => {
    queryMock.mockReset();
    withCurrentUserMock.mockReset();
    withCurrentUserMock.mockImplementation(async (_userId: string, fn: (c: { query: typeof queryMock }) => Promise<unknown>) =>
      fn({ query: queryMock })
    );
  });

  it("rejects empty lines array (fail closed)", async () => {
    await expect(
      createBill(
        {
          operatingCompanyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          vendorId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          billDate: "2026-07-21",
          amountCents: 1000,
          lines: [],
        },
        "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
      )
    ).rejects.toThrow("bill_lines_required");
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("rejects when line sum does not match amount_cents", async () => {
    await expect(
      createBill(
        {
          operatingCompanyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          vendorId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          billDate: "2026-07-21",
          amountCents: 5000,
          lines: [{ amountCents: 1000, accountId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", section: "A" }],
        },
        "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
      )
    ).rejects.toThrow("bill_lines_amount_mismatch");
  });

  it("INSERTs accounting.bill_lines in the same withCurrentUser callback as the bill header", async () => {
    const billId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    const accountId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("INSERT INTO accounting.bills")) {
        return {
          rowCount: 1,
          rows: [
            {
              id: billId,
              operating_company_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
              vendor_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
              vendor_uuid: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
              bill_number: null,
              bill_date: "2026-07-21",
              due_date: null,
              amount_cents: 2500,
              total_amount: 25,
              paid_cents: 0,
              paid_amount: 0,
              status: "unpaid",
              memo: null,
              coa_account_id: null,
              qbo_bill_id: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              revoked_at: null,
              is_reconciled: false,
            },
          ],
        };
      }
      if (sql.includes("FROM catalogs.accounts")) {
        return { rows: [{ id: accountId }] };
      }
      if (sql.includes("INSERT INTO accounting.bill_lines")) {
        return { rowCount: 1, rows: [] };
      }
      return { rows: [] };
    });

    await createBill(
      {
        operatingCompanyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        vendorId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        billDate: "2026-07-21",
        amountCents: 2500,
        lines: [
          {
            amountCents: 2500,
            accountId,
            description: "Parts",
            section: "A",
          },
        ],
      },
      "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
    );

    const sqlCalls = queryMock.mock.calls.map((c) => String(c[0]));
    expect(sqlCalls.some((s) => s.includes("INSERT INTO accounting.bills"))).toBe(true);
    expect(sqlCalls.some((s) => s.includes("INSERT INTO accounting.bill_lines"))).toBe(true);
    expect(withCurrentUserMock).toHaveBeenCalled();
  });
});
