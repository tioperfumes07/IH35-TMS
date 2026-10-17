/**
 * LEAD 443.184 — fail-old: the one bill header INSERT wrote whatever columns its caller listed, and no writer listed
 * accounting.bills.source (prod USMCA: 159 of 159 bills source NULL), so a bill's lineage could only be guessed from memo
 * text. Now the INSERT refuses a bill that does not name its writer.
 */
import { describe, expect, it, vi } from "vitest";
import { BILL_SOURCES, BillSourceRequiredError, insertBillHeaderOnClient } from "../bills.service.js";

describe("insertBillHeaderOnClient — every bill names its writer", () => {
  it("refuses a bill with no source, or a source outside the list", async () => {
    const client = { query: vi.fn(async () => ({ rows: [{ id: "b1" }], rowCount: 1 })) };
    await expect(insertBillHeaderOnClient(client, [["operating_company_id", { value: "co" }]])).rejects.toBeInstanceOf(BillSourceRequiredError);
    await expect(insertBillHeaderOnClient(client, [["operating_company_id", { value: "co" }], ["source", { value: "memo_guess" }]])).rejects.toBeInstanceOf(BillSourceRequiredError);
    expect(client.query).not.toHaveBeenCalled();
  });

  it("writes a bill that names its writer", async () => {
    const client = { query: vi.fn(async () => ({ rows: [{ id: "b1" }], rowCount: 1 })) };
    await insertBillHeaderOnClient(client, [["operating_company_id", { value: "co" }], ["source", { value: "work_order" }], ["linked_work_order_uuid", { value: "wo-1" }]]);
    const [sql, values] = client.query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toMatch(/INSERT INTO accounting\.bills \(operating_company_id, source, linked_work_order_uuid\)/);
    expect(values).toEqual(["co", "work_order", "wo-1"]);
    expect(BILL_SOURCES).toContain("settlement_driver_bill");
  });
});
