import { describe, expect, it, vi } from "vitest";

vi.mock("../display-id.js", () => ({ nextExpenseDisplayId: vi.fn(async () => "EXP-1") }));
vi.mock("../../expense-attribution/expense-number.js", () => ({
  generateExpenseNumber: vi.fn(async () => ({ number: "12345-1", seq: 1, loadNumber: "12345" })),
  insertExpenseLoadLink: vi.fn(async () => undefined),
}));
vi.mock("../posting-engine.service.js", () => ({
  postSourceTransactionInClientTx: vi.fn(async () => ({ journal_entry_id: "je", posting_batch_id: "batch" })),
}));
const { createAndPostBankLineExpenseOnClient } = await import("../bank-line-expense.service.js");
const input = {
  operatingCompanyId: "company", transactionDate: "2026-10-16", amountCents: 2500,
  memo: "Receipt", vendorId: "vendor", paymentAccountId: "bank", expenseAccountId: "cost",
  itemId: "item", lineDescription: "Receipt", sourceBankTransactionId: "bank-line", loadId: "load",
};
function fixture(overrides: Record<string, unknown> = {}, missing = false) {
  const row = { unit_id: "truck", primary_driver_id: "driver", secondary_driver_id: null,
    company_trailer_id: "trailer", non_owned_trailer_id: null, trailer_source: "company", ...overrides };
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    void values;
    if (sql.includes("FROM mdata.loads l")) return { rows: missing ? [] : [row] };
    if (sql.includes("FROM catalogs.items")) return { rows: [{ id: "item", default_expense_account_id: "cost" }] };
    if (sql.includes("INSERT INTO accounting.expenses")) return { rows: [{ id: "expense" }] };
    return { rows: [] };
  });
  return { query };
}
function inserted(client: ReturnType<typeof fixture>, table: string) {
  const call = client.query.mock.calls.find(([sql]) => sql.includes(`INSERT INTO accounting.${table} (`));
  expect(call).toBeDefined();
  const columns = call![0].split("(")[1].split(")")[0].split(",").map(s => s.trim());
  const placeholders = call![0].split("VALUES (")[1].split(")")[0].split(",").map(s => s.trim());
  return Object.fromEntries(columns.map((col, index) => {
    const parameter = placeholders[index].match(/^\$(\d+)/);
    return [col, parameter ? call![1]?.[Number(parameter[1]) - 1] : placeholders[index]];
  }));
}
// LEAD 443.183 G6 — a bank line categorized to a load becomes an expense document that takes the load's unit, driver and
// trailer (same resolver + mismatch rule as Record Expense); a contradiction or a load of another company is refused before
// any write. Load-spine number + expense_load_links + load_id on the line (postings read it) were already on main.
describe("G6 bank expense inherits the canonical load attribution", () => {
  it("copies the load dimensions to both the document and line before posting", async () => {
    const client = fixture();
    await createAndPostBankLineExpenseOnClient(client as never, input, { userId: "actor" });
    expect(inserted(client, "expenses")).toMatchObject({ load_id: "load", unit_id: "truck", driver_uuid: "driver", trailer_id: "trailer" });
    expect(inserted(client, "expense_lines")).toMatchObject({ load_id: "load", unit_id: "truck", driver_id: "driver", trailer_id: "trailer" });
  });
  it.each(["unitId", "driverId", "trailerId"] as const)("refuses contradictory %s before any insert", async key => {
    const client = fixture();
    await expect(createAndPostBankLineExpenseOnClient(client as never, { ...input, [key]: "wrong" }, { userId: "actor" })).rejects.toThrow(/mismatch/i);
    expect(client.query.mock.calls.some(([sql]) => sql.includes("INSERT"))).toBe(false);
  });
  it("refuses a load absent from this company before writing", async () => {
    const client = fixture({}, true);
    await expect(createAndPostBankLineExpenseOnClient(client as never, input, { userId: "actor" })).rejects.toThrow(/load/i);
    expect(client.query.mock.calls.some(([sql]) => sql.includes("INSERT"))).toBe(false);
  });
  it("retains the customer trailer on the header, reachable by the line's expense_id", async () => {
    const client = fixture({ company_trailer_id: null, non_owned_trailer_id: "customer-trailer", trailer_source: "customer" });
    await createAndPostBankLineExpenseOnClient(client as never, input, { userId: "actor" });
    expect(inserted(client, "expenses")).toMatchObject({ trailer_id: null, non_owned_trailer_id: "customer-trailer" });
    expect(inserted(client, "expense_lines")).toMatchObject({ expense_id: "expense", load_id: "load", trailer_id: null });
  });
  it("does not resurrect trailer history after the load explicitly chooses none", async () => {
    const client = fixture({ trailer_source: "none" });
    await createAndPostBankLineExpenseOnClient(client as never, input, { userId: "actor" });
    expect(inserted(client, "expenses")).toMatchObject({ trailer_id: null, non_owned_trailer_id: null });
    expect(inserted(client, "expense_lines")).toMatchObject({ trailer_id: null });
  });
  it("refuses even a historical company trailer when the current load choice is none", async () => {
    const client = fixture({ trailer_source: "none" });
    await expect(createAndPostBankLineExpenseOnClient(client as never, { ...input, trailerId: "trailer" }, { userId: "actor" })).rejects.toThrow(/mismatch/i);
    expect(client.query.mock.calls.some(([sql]) => sql.includes("INSERT"))).toBe(false);
  });
});
