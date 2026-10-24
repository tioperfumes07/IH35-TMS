import { describe, expect, it, vi, beforeEach } from "vitest";
import { ApiError } from "../client";

vi.mock("../client", async () => {
  const actual = await vi.importActual<typeof import("../client")>("../client");
  return {
    ...actual,
    apiRequest: vi.fn(),
  };
});

import { apiRequest } from "../client";
import {
  confirmExpenseLoads,
  ExpenseLoadConfirmEngineUnavailableError,
  formatProposalEvidence,
  listExpenseLoadConfirmations,
} from "../expenseLoadConfirmations";

describe("expenseLoadConfirmations API (443.288-C)", () => {
  beforeEach(() => {
    vi.mocked(apiRequest).mockReset();
  });

  it("lists proposed rows through the ruling path", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce({ rows: [] });
    await listExpenseLoadConfirmations("co-1", { status: "proposed" });
    expect(apiRequest).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/accounting/expense-load-confirmations?status=proposed"),
    );
    expect(apiRequest).toHaveBeenCalledWith(expect.stringContaining("operating_company_id=co-1"));
  });

  it("fails closed on 404 (engine not deployed)", async () => {
    vi.mocked(apiRequest).mockRejectedValueOnce(new ApiError(404, { error: "not_found" }));
    await expect(listExpenseLoadConfirmations("co-1")).rejects.toBeInstanceOf(
      ExpenseLoadConfirmEngineUnavailableError,
    );
  });

  it("posts bulk confirm", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce({ confirmed: 2 });
    await confirmExpenseLoads("co-1", { expense_ids: ["a", "b"] });
    expect(apiRequest).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/accounting/expense-load-confirmations/confirm"),
      expect.objectContaining({ method: "POST", body: { operating_company_id: "co-1", items: [{ expense_id: "a" }, { expense_id: "b" }] } }),
    );
  });

  it("sends multi-select filters as the engine's comma lists and maps engine rows (LEAD 443.301)", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce({ total_count: 1, rows: [{ expense_id: "e1", expense_number: "13574-1", date: "2026-10-20",
      amount_cents: "12345", load_confirmation: "proposed", evidence: { truck_at_pump: true }, confirmed_by_user_id: null,
      load_confirmed_at: null, vendor_id: "v1", vendor_name: "Love's", driver_id: "d1", driver_name: "Angel", unit_id: "u1",
      unit_number: "T156", load_id: "l1", load_number: "13574", settlements: [{ settlement_id: "s1", display_id: "P-0122" }] }] });
    const out = await listExpenseLoadConfirmations("co-1", { status: "all", driver_id: "d1,d2", vendor_uuid: "v1", settlement_id: "s1" });
    const url = String(vi.mocked(apiRequest).mock.calls[0][0]);
    expect(url).toContain("driver_ids=d1%2Cd2");
    expect(url).toContain("vendor_ids=v1");
    expect(url).toContain("settlement_ids=s1");
    expect(out.rows[0]).toMatchObject({ id: "e1", transaction_date: "2026-10-20", settlement_number: "P-0122", proposal_evidence: { truck_at_pump: true } });
  });

  it("formats proposal evidence in plain English", () => {
    expect(
      formatProposalEvidence({
        truck_at_pump: true,
        gps_distance_miles: 0.4,
        minutes_off: 12,
        load_running: true,
      }),
    ).toBe("truck at pump · 0.4 mi GPS · 12 min off · load running");
  });
});
