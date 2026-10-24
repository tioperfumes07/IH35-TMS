/**
 * Lead order (verify-costs-are-expenses-not-handwritten-jes): a Dreamline statement line where the card charged MORE
 * than the receipt is a COST — on main it was a handwritten JE (Dr Fuel Card Discount / Cr 2510, no expense row; 65 on
 * prod). Fail-old: it must be an expense document through THE expense writer, carrying the receipt's load / driver / unit.
 */
import { describe, expect, it, vi } from "vitest";
// OWNER RULING 443.288-A: the child document is linked to its receipt through THE family link (asserted below).
const family = vi.hoisted(() => ({ linkExpenseChildToParentInClientTx: vi.fn(async () => undefined) }));
vi.mock("../../accounting/reclassify/reclassify.service.js", async (importOriginal) => ({ ...(await importOriginal<object>()), ...family }));

const writer = vi.hoisted(() => ({ createExpenseInClientTx: vi.fn(async () => ({ expense_id: "e-new", posted_journal_entry_id: "je-new" })) }));
vi.mock("../../accounting/expense-writer.service.js", () => writer);
import { postStatementCostDifferenceAsExpense } from "../dreamline-statement-import.service.js";

const input = { companyId: "co", actor: "u", expenseId: "e-receipt", differenceCents: -2, date: "2026-10-05", marker: "dreamline_efs=73386:DEFD:1", payableId: "acct-2510", discountAccountId: "acct-5000", discountItemId: "item-fcd" };

describe("postStatementCostDifferenceAsExpense", () => {
  it("writes the card-charged-more difference as an expense document (Dr Fuel Card Discount / Cr 2510), never a JE", async () => {
    const sql: string[] = [];
    const client = { query: vi.fn(async (s: string) => { sql.push(s); return { rows: [{ vendor: "v-loves", load_id: "l-1", driver: "d-1", unit_id: "u-1", trailer_id: "t-old" }] }; }) };
    expect(await postStatementCostDifferenceAsExpense(client as never, input)).toBe("je-new");
    expect(writer.createExpenseInClientTx).toHaveBeenCalledWith(client, expect.objectContaining({
      amount_cents: 2, payment_account_uuid: "acct-2510", category_account_id: "acct-5000", item_id: "item-fcd",
      vendor_uuid: "v-loves", load_id: "l-1", vendor_document_number: "dreamline_efs=73386:DEFD:1-CARD-DIFF",
    }), "u");
    const arg = (writer.createExpenseInClientTx.mock.calls[0] as unknown as [unknown, Record<string, unknown>])[1];
    expect(arg).not.toHaveProperty("trailer_id"); // the load decides the trailer, never the receipt's older stamp
    // with a load the LOAD decides unit / driver (the writer's load attribution) — the receipt's own stamps are not sent
    expect(arg).not.toHaveProperty("driver_id");
    expect(arg).not.toHaveProperty("unit_id");
    expect(sql.join("\n")).not.toMatch(/INSERT INTO accounting\.journal_entries/);
    // 443.288-A: the difference document names its receipt structurally, never in the memo.
    expect(family.linkExpenseChildToParentInClientTx).toHaveBeenCalledWith(client, {
      operatingCompanyId: "co", childExpenseId: "e-new", parentExpenseId: "e-receipt", journalEntryId: "je-new", role: "statement_card_difference_of",
    });
    expect(String(arg.memo)).not.toContain("e-receipt");
  });
  it("a re-run of the same statement line is the same document (duplicate → no second post)", async () => {
    writer.createExpenseInClientTx.mockResolvedValueOnce({ duplicateVendorDocumentNumber: true } as never);
    const client = { query: vi.fn(async () => ({ rows: [{ vendor: "v", load_id: null, driver: null, unit_id: null, trailer_id: null }] })) };
    expect(await postStatementCostDifferenceAsExpense(client as never, input)).toBeNull();
  });
});
