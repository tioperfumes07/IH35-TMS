import { describe, expect, it } from "vitest";
import { BULK_TXN_MAX } from "./bulk-transactions.js";

describe("bulk transaction limits", () => {
  it("caps bulk selection at 500 transactions", () => {
    expect(BULK_TXN_MAX).toBe(500);
  });
});
