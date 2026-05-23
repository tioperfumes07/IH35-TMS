import { describe, expect, it, vi } from "vitest";
import { acceptReconMatch } from "../recon-worklist.service.js";

const { mockAccept, mockPreview } = vi.hoisted(() => ({
  mockAccept: vi.fn(),
  mockPreview: vi.fn(),
}));

vi.mock("../../../auth/db.js", () => ({
  withLuciaBypass: vi.fn(),
}));

vi.mock("../match.service.js", () => ({
  acceptMatchWithResolveDifference: mockAccept,
  previewMatchVariance: mockPreview,
}));

describe("bank recon accept match without variance", () => {
  it("allows acceptance without variance account when variance is zero", async () => {
    mockPreview.mockResolvedValue({
      variance_cents: 0,
      bank_amount_cents: 10000,
      ledger_amount_cents: 10000,
    });
    mockAccept.mockResolvedValue({
      variance_cents: 0,
      difference_posted: false,
      journal_entry_id: null,
      cash_basis_revenue_cents: 10000,
    });

    await acceptReconMatch({
      operating_company_id: "11111111-1111-4111-8111-111111111111",
      bank_transaction_id: "22222222-2222-4222-8222-222222222222",
      actor_user_uuid: "33333333-3333-4333-8333-333333333333",
      ledger_entry_kind: "payment",
      ledger_entry_id: "44444444-4444-4444-8444-444444444444",
    });

    expect(mockAccept).toHaveBeenCalledWith(
      expect.objectContaining({
        difference_account_id: "00000000-0000-4000-8000-000000000000",
      })
    );
  });
});
