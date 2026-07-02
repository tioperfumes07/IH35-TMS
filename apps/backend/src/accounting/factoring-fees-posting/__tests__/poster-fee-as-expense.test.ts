import { describe, expect, it, vi } from "vitest";
import { postFactoringFeeExpenseEvent } from "../poster.service.js";

// CODER-34 — the factoring fee is now booked at FUNDING (Dr Factoring Fees / Cr Factoring Advance liability)
// in factoring-posting/poster.service.ts. This standalone release-time poster is a documented no-op: it must
// NOT post any JE and must NEVER credit A/R (the old sale-model behavior this rebuild removes).
const { mockWithLuciaBypass, mockCreateJournalEntry } = vi.hoisted(() => ({
  mockWithLuciaBypass: vi.fn(),
  mockCreateJournalEntry: vi.fn(),
}));

vi.mock("../../../auth/db.js", () => ({ withLuciaBypass: mockWithLuciaBypass }));
vi.mock("../../journal-entries.service.js", () => ({ createJournalEntry: mockCreateJournalEntry }));

describe("factoring fee posting (deprecated — fee booked at funding)", () => {
  it("is a no-op: posts no JE and never touches A/R", async () => {
    mockWithLuciaBypass.mockReset();
    mockCreateJournalEntry.mockReset();

    const result = await postFactoringFeeExpenseEvent({
      operating_company_id: "11111111-1111-4111-8111-111111111111",
      factoring_advance_id: "22222222-2222-4222-8222-222222222222",
      factor_fee_cents: 20000,
      released_at_iso: "2026-02-20T00:00:00.000Z",
      actor: { user_id: "33333333-3333-4333-8333-333333333333", role: "Administrator" },
    });

    expect(result).toEqual({ posted: false, reason: "fee_booked_at_funding" });
    expect(mockCreateJournalEntry).not.toHaveBeenCalled();
    expect(mockWithLuciaBypass).not.toHaveBeenCalled();
  });
});
