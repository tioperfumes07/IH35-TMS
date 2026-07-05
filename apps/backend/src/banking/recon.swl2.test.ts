import { describe, expect, it, vi, beforeEach } from "vitest";

// SWL-2: a factoring-suggestion lookup failure is best-effort (must not break the panel) but must
// be LOGGED with context, not silently faked as "no factoring match".
const { errorMock } = vi.hoisted(() => ({ errorMock: vi.fn() }));
vi.mock("../observability/structured-logger.js", () => ({
  logger: { error: (...a: unknown[]) => errorMock(...a), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const { getSuggestionsForTxnMock } = vi.hoisted(() => ({ getSuggestionsForTxnMock: vi.fn() }));
vi.mock("../factoring/bank-match.service.js", () => ({
  getSuggestionsForTxn: (...a: unknown[]) => getSuggestionsForTxnMock(...a),
}));

import { appendFactoringSuggestions, type BankingReconSuggestion } from "./recon.service.js";

const base: BankingReconSuggestion[] = [
  {
    obligation_type: "load",
    obligation_id: "load-1",
    label: "Load 1",
    amount_cents: 12345,
    event_date: "2026-07-01",
    confidence: 0.9,
    lev: 0,
    suggestion_source: "obligation",
  },
];

const client = { query: async () => ({ rows: [] }) };

describe("SWL-2 banking recon — factoring lookup failure logs + falls back (never a silent empty)", () => {
  beforeEach(() => {
    errorMock.mockClear();
    getSuggestionsForTxnMock.mockReset();
  });

  it("on lookup failure: base suggestions preserved AND the failure is logged with context", async () => {
    getSuggestionsForTxnMock.mockRejectedValueOnce(new Error("query failed"));

    const out = await appendFactoringSuggestions({
      client,
      operating_company_id: "oci",
      bank_transaction_id: "txn-1",
      baseSuggestions: base,
    });

    // Best-effort: the base obligation suggestions still come through (panel not broken).
    expect(out).toEqual(base);

    // But the failure was surfaced via the logger, not swallowed to look like "no match".
    expect(errorMock).toHaveBeenCalledTimes(1);
    const [, , ctx] = errorMock.mock.calls[0];
    expect(ctx).toMatchObject({
      company_id: "oci",
      bank_transaction_id: "txn-1",
      surface: "banking.appendFactoringSuggestions",
    });
  });

  it("on success: factoring suggestions appended, nothing logged", async () => {
    getSuggestionsForTxnMock.mockResolvedValueOnce([
      {
        batch_id: "b-1",
        batch_number: "FB-100",
        expected_advance_cents: 5000,
        submitted_at: "2026-07-01T00:00:00.000Z",
        confidence: 0.8,
        id: "sug-1",
      },
    ]);

    const out = await appendFactoringSuggestions({
      client,
      operating_company_id: "oci",
      bank_transaction_id: "txn-1",
      baseSuggestions: base,
    });

    expect(out.length).toBe(2);
    expect(out[1].suggestion_source).toBe("factoring");
    expect(errorMock).not.toHaveBeenCalled();
  });
});
