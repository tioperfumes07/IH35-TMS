import { describe, expect, it } from "vitest";
import { mapPlaidAccountClass } from "../integrations/plaid/plaid.service.js";
import { normalizeBankTransactionDescription } from "./transaction-ingestion.js";

describe("normalizeBankTransactionDescription", () => {
  it("lowercases, collapses whitespace, and strips trailing #reference tails", () => {
    expect(normalizeBankTransactionDescription("  AMAZON   MARKETPLACE ")).toBe("amazon marketplace");
    expect(normalizeBankTransactionDescription("POS Purchase CARDMEMBER #1234")).toBe("pos purchase cardmember");
    expect(normalizeBankTransactionDescription("POS Purchase CARDMEMBER #1234 #5678")).toBe("pos purchase cardmember");
  });
});

describe("mapPlaidAccountClass", () => {
  it("maps Plaid account types into reconciliation buckets", () => {
    expect(mapPlaidAccountClass("depository")).toBe("depository");
    expect(mapPlaidAccountClass("credit")).toBe("credit");
    expect(mapPlaidAccountClass("investment")).toBe("investment");
    expect(mapPlaidAccountClass("loan")).toBe("other");
  });
});
