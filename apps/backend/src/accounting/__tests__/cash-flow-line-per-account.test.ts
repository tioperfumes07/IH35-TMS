import { describe, expect, it } from "vitest";
import { lineKeyOf } from "../cash-flow.service.js";

// ROUND 433.3 — the Cash Flow Statement could not drill: lines were grouped by account TYPE:subtype, so no line
// had an account_id. One line per account now, keyed by the account, labelled "number name".
describe("cash-flow line grain is the account", () => {
  it("two accounts of the same type are two lines", () => {
    const a = lineKeyOf({ account_id: "a1", account_number: "5010", account_name: "Diesel", account_type: "Expense", account_subtype: "fuel" });
    const b = lineKeyOf({ account_id: "a2", account_number: "5015", account_name: "Reefer Diesel", account_type: "Expense", account_subtype: "fuel" });
    expect(a.key).not.toBe(b.key);
    expect(a.label).toBe("5010 Diesel");
    expect(b.label).toBe("5015 Reefer Diesel");
  });
  it("the same account always lands on the same line", () => {
    const leg = { account_id: "a1", account_number: "5010", account_name: "Diesel", account_type: "Expense", account_subtype: "fuel" };
    expect(lineKeyOf(leg).key).toBe(lineKeyOf({ ...leg }).key);
  });
  it("a posting whose account row is missing falls back to the type line (never dropped)", () => {
    const k = lineKeyOf({ account_id: null, account_type: "Expense", account_subtype: "fuel" });
    expect(k.label).toBe("Expense:fuel");
    expect(k.key).toBe("type:Expense:fuel");
  });
});
