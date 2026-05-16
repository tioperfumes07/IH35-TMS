import { describe, expect, it } from "vitest";
import { buildQboJournalEntryPayload } from "../journal_entry.js";

describe("buildQboJournalEntryPayload", () => {
  it("balanced journal entry", () => {
    const p = buildQboJournalEntryPayload({
      txnDate: "2026-05-04",
      adjustment: true,
      memo: "adj",
      lines: [
        { postingType: "Debit", amountCents: 1000, accountQboId: "a1", description: "d" },
        { postingType: "Credit", amountCents: 1000, accountQboId: "a2", description: "c" },
      ],
    });
    expect(p.Adjustment).toBe(true);
    expect((p.Line as unknown[]).length).toBe(2);
  });
});
