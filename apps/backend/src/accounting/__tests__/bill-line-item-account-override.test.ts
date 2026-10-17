/**
 * 443.67 G3 / 443.100 row 816 — createBill writes item_account_override_reason, and refuses (named, before the
 * INSERT) a line of an enforcing company whose account differs from its item's default without a reason.
 * Mocks DB / audit / QBO side-effects — the real trigger is proven in line-categorization.db.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();
const withCurrentUserMock = vi.fn();

vi.mock("../../auth/db.js", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return {
    ...actual,
    withCurrentUser: (userId: string, fn: (client: { query: typeof queryMock }) => Promise<unknown>) =>
      withCurrentUserMock(userId, fn),
    withLuciaBypass: vi.fn(),
  };
});

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
import { LineCategorizationError, lineCategorizationRefusal } from "../line-categorization.js";

const OPCO = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const VENDOR = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ACCOUNT = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const ITEM_DEFAULT = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const ITEM = "12121212-1212-4121-8121-121212121212";

function mockDb(enforce: boolean) {
  queryMock.mockImplementation(async (sql: string) => {
    if (sql.includes("INSERT INTO accounting.bills")) {
      return { rowCount: 1, rows: [{ id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", operating_company_id: OPCO, vendor_id: VENDOR, amount_cents: 2500, status: "unpaid" }] };
    }
    if (sql.includes("enforce_line_categorization")) return { rows: [{ enforce }] };
    if (sql.includes("AS item_account")) return { rows: [{ item_account: ITEM_DEFAULT }] };
    if (sql.includes("FROM catalogs.items")) return { rows: [{ id: ITEM }] };
    if (sql.includes("FROM catalogs.accounts")) return { rows: [{ id: ACCOUNT }] };
    if (sql.includes("FROM mdata.vendors")) return { rows: [{ id: VENDOR, qbo_vendor_id: null }] };
    if (sql.includes("INSERT INTO accounting.bill_lines")) return { rowCount: 1, rows: [] };
    return { rows: [] };
  });
}

const itemLine = (reason?: string) => ({
  amountCents: 2500, accountId: ACCOUNT, section: "A" as const, itemId: ITEM, quantity: 1, rateCents: 2500, unitOfMeasure: "each",
  itemAccountOverrideReason: reason,
});

const lineInserts = () => queryMock.mock.calls.filter(([sql]) => String(sql).includes("INSERT INTO accounting.bill_lines"));

describe("createBill — item account override reason (443.67 G3)", () => {
  beforeEach(() => {
    queryMock.mockReset();
    withCurrentUserMock.mockReset();
    withCurrentUserMock.mockImplementation(async (_u: string, fn: (c: { query: typeof queryMock }) => Promise<unknown>) => fn({ query: queryMock }));
  });

  it("an enforcing company's line off its item's account with no reason is refused before the INSERT, as a named 422", async () => {
    mockDb(true);
    const err = await createBill({ operatingCompanyId: OPCO, source: "manual", vendorId: VENDOR, billDate: "2026-10-12", amountCents: 2500, lines: [itemLine()] }, "u").catch((e) => e);
    expect(err).toBeInstanceOf(LineCategorizationError);
    expect(lineCategorizationRefusal(err)).toMatchObject({ error: "line_account_differs_from_item", field: "item_account_override_reason" });
    expect(lineInserts()).toHaveLength(0);
  });

  it("with a reason the line is written and carries it", async () => {
    mockDb(true);
    await createBill({ operatingCompanyId: OPCO, source: "manual", vendorId: VENDOR, billDate: "2026-10-12", amountCents: 2500, lines: [itemLine("  Owner: tires billed to repairs per vendor invoice  ")] }, "u");
    const [[sql, params]] = lineInserts();
    expect(String(sql)).toContain("item_account_override_reason");
    expect((params as unknown[]).at(-1)).toBe("Owner: tires billed to repairs per vendor invoice");
  });

  it("a non-enforcing company is not asked for a reason", async () => {
    mockDb(false);
    await createBill({ operatingCompanyId: OPCO, source: "manual", vendorId: VENDOR, billDate: "2026-10-12", amountCents: 2500, lines: [itemLine()] }, "u");
    expect(lineInserts()).toHaveLength(1);
  });

  it("the database trigger's own refusal maps to the same 422 body", () => {
    expect(lineCategorizationRefusal(new Error("line_account_differs_from_item: bill_lines line posts to 5000 but its item defaults to 6100"))).toMatchObject({ error: "line_account_differs_from_item", field: "item_account_override_reason" });
    expect(lineCategorizationRefusal(new Error("line_item_required: bill_lines line has neither an item nor an account"))).toMatchObject({ error: "line_item_required", field: "item_id" });
    expect(lineCategorizationRefusal(new Error("bill_lines_required"))).toBeNull();
  });
});
