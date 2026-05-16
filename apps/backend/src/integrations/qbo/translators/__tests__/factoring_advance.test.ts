import { describe, expect, it } from "vitest";
import { buildQboFactoringAdvanceJournalPayload } from "../factoring_advance.js";

describe("buildQboFactoringAdvanceJournalPayload", () => {
  it("produces journalentry-shaped payload", () => {
    const p = buildQboFactoringAdvanceJournalPayload({
      txnDate: "2026-05-06",
      docNumber: "FA-X",
      amountCents: 10_000,
      memo: "Factoring advance INV-2026-00001",
      cashAccountQboId: "cash",
      liabilityAccountQboId: "liab",
    });
    expect((p.Line as unknown[]).length).toBe(2);
    expect(p.PrivateNote).toBe("Factoring advance INV-2026-00001");
  });
});
