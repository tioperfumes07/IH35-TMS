import { describe, expect, it } from "vitest";
import { batchTotals, dollarsToCents, duplicateRow, fillDown, newRow, normalizeDate, parsePastedRows, validateRow } from "../batchExpenseRows";

const resolve = {
  vendorByName: (n: string) => (n.toLowerCase() === "dreamline" ? "ven-dl" : null),
  accountByName: (n: string) => (/fuel/i.test(n) ? "acc-5000" : null),
  paymentAccountByName: (n: string) => (/bofa|bank of america/i.test(n) ? "acc-1000" : null),
  classByName: (n: string) => (n === "T100" ? "cls-t100" : null),
};

describe("Batch transactions — row rules (QBO spec §23)", () => {
  it("parses a pasted sheet (tab-separated, header skipped), resolves names to ids, keeps unresolved names for the cell error", () => {
    const rows = parsePastedRows(
      "Date\tPayee\tPaid from\tMethod\tRef\tAmount\tCategory\tClass\tLoad\tMemo\n09/29/2026\tDreamline\tBofA\tach\t\t6,767.78\tFuel-Truck-Diesel\tT100\t13593\tZelle to Dreamline\n2026-09-30\tNobody\tBofA\tcheck\t1699\t15\tParking\t\t\t",
      resolve,
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ date: "2026-09-29", payee: "ven-dl", paymentAccount: "acc-1000", paymentMethod: "ach", amount: "6,767.78", category: "acc-5000", classId: "cls-t100", loadNumber: "13593" });
    expect(validateRow(rows[0]!)).toEqual({});
    expect(rows[1]).toMatchObject({ payee: "", payeeText: "Nobody", category: "", categoryText: "Parking", refNo: "1699" });
    expect(validateRow(rows[1]!)).toMatchObject({ payee: 'No vendor named "Nobody"', category: 'No account named "Parking"' });
  });

  it("validates per cell: date, paid-from, method, amount > 0, category, check needs a number", () => {
    const e = validateRow(newRow({ amount: "0", paymentMethod: "check" }));
    expect(e).toMatchObject({ date: "Date required", paymentAccount: expect.any(String), amount: "Must be > 0", category: expect.any(String), refNo: "Check number required for a check" });
    expect(dollarsToCents("$1,234.56")).toBe(123456);
    expect(normalizeDate("9/5/26")).toBe("2026-09-05");
    expect(normalizeDate("not a date")).toBe("");
  });

  it("fill-down copies into blank cells below (never into saved rows); duplicate inserts a fresh draft without the ref no.", () => {
    const rows = [newRow({ paymentAccount: "acc-1000", refNo: "1" }), newRow(), newRow({ paymentAccount: "acc-2", status: "saved", expenseId: "e" }), newRow()];
    const filled = fillDown(rows, "paymentAccount", 0);
    expect(filled.map((r) => r.paymentAccount)).toEqual(["acc-1000", "acc-1000", "acc-2", "acc-1000"]);
    const dup = duplicateRow(filled, 0);
    expect(dup).toHaveLength(5);
    expect(dup[1]).toMatchObject({ paymentAccount: "acc-1000", refNo: "", status: "draft", expenseId: null });
    expect(dup[1]!.key).not.toBe(dup[0]!.key);
  });

  it("totals count only non-empty rows and sum only valid positive amounts", () => {
    const t = batchTotals([newRow(), newRow({ date: "2026-09-01", paymentAccount: "a", paymentMethod: "ach", amount: "10.00", category: "c" }), newRow({ amount: "abc", date: "2026-09-01" })]);
    expect(t).toEqual({ rows: 2, cents: 1000, ready: 1, saved: 0, errors: 1 });
  });
});
