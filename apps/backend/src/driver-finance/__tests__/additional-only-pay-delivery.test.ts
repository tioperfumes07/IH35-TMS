import { describe, expect, it, vi } from "vitest";
import { accrueDriverPayAtDeliveryInClientTx } from "../driver-pay-delivery-accrual.service.js";
import { createBillInClientTx, postBillDocumentInClientTx } from "../../accounting/bills.service.js";
vi.mock("../../accounting/bills.service.js", () => ({ createBillInClientTx: vi.fn(async () => ({ id: "bill" })), postBillDocumentInClientTx: vi.fn(async () => ({ journal_entry_id: "je" })) }));
vi.mock("../../accounting/coa-roles/resolver.service.js", () => ({ resolveRoleAccountOptional: vi.fn(async (_c, _co, role) => role) }));
vi.mock("../../accounting/driver-vendor-link.service.js", () => ({ resolveDriverVendorLink: vi.fn(async () => ({ vendorId: "driver-vendor" })) }));
vi.mock("../../accounting/bill-trailer-stamp.service.js", () => ({ stampNewDriverBillTrailerFromLoad: vi.fn(async () => {}) }));
vi.mock("../../audit/crud-audit.js", () => ({ appendCrudAudit: vi.fn(async () => {}) }));

describe("additional-only pay delivery uses the same itemized bill poster", () => {
  it("posts Layover to its mapped account, not Loaded Miles, then close has no second pay to post", async () => {
    const query = vi.fn(async (sql: string) => {
      if (/load_driver_pay_due/.test(sql)) return { rows: [{ due_date: "2026-10-20", basis: "delivered" }] };
      if (/FROM driver_finance.driver_bills/.test(sql)) return { rows: [{ id: "driver-bill", load_number: "synthetic", driver_id: "driver", gross: 10000,
        loaded: 10000, deadhead: 0, unit_id: "unit", quicksave_pending_fields: { driver_pay_plan: { mode: "additional_pay_only", amount_cents: 10000,
          reason: "signed", lines: [{ item_id: "layover-item", amount_cents: 10000, description: "Layover" }] } } }] };
      if (/FROM catalogs.items/.test(sql)) return { rows: [{ account_id: "layover-account" }] };
      if (/FROM accounting.bills/.test(sql)) return { rows: [] };
      if (/UPDATE driver_finance.driver_bills/.test(sql)) return { rows: [], rowCount: 1 };
      throw new Error(`Unexpected query: ${sql}`);
    });
    await accrueDriverPayAtDeliveryInClientTx({ query } as never, { operatingCompanyId: "company", loadId: "load", actorUserId: "actor" });
    expect(createBillInClientTx).toHaveBeenCalledTimes(1);
    expect(createBillInClientTx).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ amountCents: 10000,
      lines: [{ accountId: "layover-account", amountCents: 10000, loadId: "load", description: "Load synthetic — Layover", itemId: "layover-item", quantity: 1, rateCents: 10000, unitOfMeasure: "each" }] }), "actor");
    expect(postBillDocumentInClientTx).toHaveBeenCalledTimes(1);
    const { splitLoadLinesAgainstDeliveryAccrual } = await import("../settlement-ap-chain.service.js");
    expect(splitLoadLinesAgainstDeliveryAccrual([{ kind: "pay", accountId: "layover-account", amountCents: 10000, description: "Layover", itemId: "layover-item" }], 10000, "synthetic").supplement).toEqual([]);
  });
});
