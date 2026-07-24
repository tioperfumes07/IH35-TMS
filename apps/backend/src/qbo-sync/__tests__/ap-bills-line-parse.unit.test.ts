/**
 * Unit tests for QBO Bill Line[] parse helpers (no DB).
 * Locks: DescriptionOnly skipped at call-site; AccountBased/ItemBased refs extracted; no header invent.
 */
import { describe, expect, it } from "vitest";
import {
  isQboBillMoneyLineDetailType,
  parseQboBillLineRefs,
  QBO_BILL_MONEY_LINE_DETAIL_TYPES,
} from "../ap-bills-puller.js";

describe("QBO bill line parse helpers", () => {
  it("recognizes only AccountBased + ItemBased as money lines", () => {
    expect(isQboBillMoneyLineDetailType("AccountBasedExpenseLineDetail")).toBe(true);
    expect(isQboBillMoneyLineDetailType("ItemBasedExpenseLineDetail")).toBe(true);
    expect(isQboBillMoneyLineDetailType("DescriptionOnly")).toBe(false);
    expect(QBO_BILL_MONEY_LINE_DETAIL_TYPES).toEqual([
      "AccountBasedExpenseLineDetail",
      "ItemBasedExpenseLineDetail",
    ]);
  });

  it("parses AccountBased AccountRef + amount + LineNum", () => {
    const parsed = parseQboBillLineRefs({
      Id: "1",
      LineNum: 1,
      Amount: 125.5,
      DetailType: "AccountBasedExpenseLineDetail",
      Description: "Fuel",
      AccountBasedExpenseLineDetail: { AccountRef: { value: "84", name: "Fuel" } },
    });
    expect(parsed.detailType).toBe("AccountBasedExpenseLineDetail");
    expect(parsed.accountQboId).toBe("84");
    expect(parsed.itemQboId).toBeNull();
    expect(parsed.amount).toBe(125.5);
    expect(parsed.description).toBe("Fuel");
    expect(parsed.lineNum).toBe(1);
  });

  it("parses ItemBased ItemRef without inventing an account", () => {
    const parsed = parseQboBillLineRefs({
      Id: "2",
      Amount: "903.75",
      DetailType: "ItemBasedExpenseLineDetail",
      Description: "Driver Pay",
      ItemBasedExpenseLineDetail: { ItemRef: { value: "59", name: "Driver Pay" } },
    });
    expect(parsed.detailType).toBe("ItemBasedExpenseLineDetail");
    expect(parsed.itemQboId).toBe("59");
    expect(parsed.accountQboId).toBeNull();
    expect(parsed.amount).toBe(903.75);
  });

  it("does not treat DescriptionOnly as a money line with account", () => {
    const parsed = parseQboBillLineRefs({
      DetailType: "DescriptionOnly",
      Description: "Note only",
    });
    expect(isQboBillMoneyLineDetailType(parsed.detailType)).toBe(false);
    expect(parsed.accountQboId).toBeNull();
    expect(parsed.itemQboId).toBeNull();
  });
});
