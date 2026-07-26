import { describe, expect, it } from "vitest";
import {
  ageBucketForDays,
  ageUnclearedTransactions,
  daysOutstanding,
} from "../reconciling-item-aging.js";

describe("BANK-DOM-04 reconciling-item aging", () => {
  it("buckets days correctly", () => {
    expect(ageBucketForDays(0)).toBe("0-30");
    expect(ageBucketForDays(30)).toBe("0-30");
    expect(ageBucketForDays(31)).toBe("31-60");
    expect(ageBucketForDays(90)).toBe("61-90");
    expect(ageBucketForDays(91)).toBe("90+");
  });

  it("escalates investigate items over 90 days", () => {
    const asOf = new Date("2026-07-26T12:00:00Z");
    const aged = ageUnclearedTransactions(
      [
        {
          id: "a",
          transaction_date: "2026-07-01",
          amount_cents: 1000,
          is_credit: false,
        },
        {
          id: "b",
          transaction_date: "2026-03-01",
          amount_cents: 5000,
          is_credit: true,
        },
      ],
      { asOf }
    );
    expect(daysOutstanding("2026-07-01", asOf)).toBe(25);
    expect(aged[0].age_bucket).toBe("0-30");
    expect(aged[0].classification).toBe("timing");
    expect(aged[0].escalated).toBe(false);
    expect(aged[1].age_bucket).toBe("90+");
    expect(aged[1].classification).toBe("investigate");
    expect(aged[1].escalated).toBe(true);
  });
});
