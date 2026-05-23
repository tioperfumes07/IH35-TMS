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

describe("bank recon accept match with variance (Q8)", () => {
  it("requires variance account and routes through Q8 resolve-difference path", async () => {
    mockPreview.mockResolvedValue({
      variance_cents: 2500,
      bank_amount_cents: 10000,
      ledger_amount_cents: 7500,
    });
    mockAccept.mockResolvedValue({
      variance_cents: 2500,
      difference_posted: true,
      journal_entry_id: "je-1",
      cash_basis_revenue_cents: 10000,
    });

    await expect(
      acceptReconMatch({
        operating_company_id: "11111111-1111-4111-8111-111111111111",
        bank_transaction_id: "22222222-2222-4222-8222-222222222222",
        actor_user_uuid: "33333333-3333-4333-8333-333333333333",
        ledger_entry_kind: "payment",
        ledger_entry_id: "44444444-4444-4444-8444-444444444444",
      })
    ).rejects.toThrow("variance_account_id_required");

    await acceptReconMatch({
      operating_company_id: "11111111-1111-4111-8111-111111111111",
      bank_transaction_id: "22222222-2222-4222-8222-222222222222",
      actor_user_uuid: "33333333-3333-4333-8333-333333333333",
      ledger_entry_kind: "payment",
      ledger_entry_id: "44444444-4444-4444-8444-444444444444",
      variance_account_id: "55555555-5555-4555-8555-555555555555",
    });

    expect(mockAccept).toHaveBeenCalledWith(
      expect.objectContaining({
        difference_account_id: "55555555-5555-4555-8555-555555555555",
      })
    );
  });
});
