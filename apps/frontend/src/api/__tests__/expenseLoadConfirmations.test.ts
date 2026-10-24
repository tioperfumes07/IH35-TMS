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
      expect.stringContaining("/api/v1/expenses/load-confirmations?status=proposed"),
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
      expect.stringContaining("/api/v1/expenses/load-confirmations/confirm"),
      expect.objectContaining({ method: "POST", body: { expense_ids: ["a", "b"] } }),
    );
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
