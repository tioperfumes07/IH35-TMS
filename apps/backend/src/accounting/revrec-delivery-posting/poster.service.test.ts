import { describe, expect, it } from "vitest";
import {
  buildBillEvent2Postings,
  buildEarnEvent1Postings,
} from "./poster.service.js";

describe("DISP-01 revrec posting builders", () => {
  it("Event 1 is balanced DR Unbilled / CR revenue", () => {
    const rows = buildEarnEvent1Postings("u", "r", 10000, "memo");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ account_id: "u", debit_or_credit: "debit", amount_cents: 10000 });
    expect(rows[1]).toMatchObject({ account_id: "r", debit_or_credit: "credit", amount_cents: 10000 });
    const debits = rows.filter((r) => r.debit_or_credit === "debit").reduce((s, r) => s + r.amount_cents, 0);
    const credits = rows.filter((r) => r.debit_or_credit === "credit").reduce((s, r) => s + r.amount_cents, 0);
    expect(debits).toBe(credits);
  });

  it("Event 2 is balanced DR A/R / CR Unbilled", () => {
    const rows = buildBillEvent2Postings("ar", "u", 10000, "memo");
    expect(rows[0]).toMatchObject({ account_id: "ar", debit_or_credit: "debit", amount_cents: 10000 });
    expect(rows[1]).toMatchObject({ account_id: "u", debit_or_credit: "credit", amount_cents: 10000 });
  });
});
