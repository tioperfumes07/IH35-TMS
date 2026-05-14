import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./client";
import {
  getCashFlowOverview,
  getCustomerProfitability,
  getProfitPerTruck,
  getSettlementSummary,
} from "./reports";

vi.mock("./client", () => ({
  ApiError: class extends Error {
    status: number;
    data: unknown;
    constructor(status: number, data: unknown) {
      super(`API ${status}`);
      this.status = status;
      this.data = data;
    }
  },
  apiRequest: vi.fn(),
}));

describe("reports API (Block T client)", () => {
  beforeEach(async () => {
    const { apiRequest } = await import("./client");
    vi.mocked(apiRequest).mockReset();
  });

  it("getCashFlowOverview calls cash-flow-overview with company and optional as_of_date", async () => {
    const { apiRequest } = await import("./client");
    vi.mocked(apiRequest).mockResolvedValue({ ok: true });

    await getCashFlowOverview({ operating_company_id: "co1", as_of_date: "2026-05-01" });

    expect(apiRequest).toHaveBeenCalledWith(
      "/api/v1/reports/cash-flow-overview?as_of_date=2026-05-01&operating_company_id=co1",
    );
  });

  it("getSettlementSummary builds period query string", async () => {
    const { apiRequest } = await import("./client");
    vi.mocked(apiRequest).mockResolvedValue({ ok: true });

    await getSettlementSummary({
      operating_company_id: "co1",
      period_start: "2026-05-01",
      period_end: "2026-05-07",
    });

    expect(apiRequest).toHaveBeenCalledWith(
      "/api/v1/reports/settlement-summary?period_start=2026-05-01&period_end=2026-05-07&operating_company_id=co1",
    );
  });

  it("getCustomerProfitability passes min_revenue_cents when set", async () => {
    const { apiRequest } = await import("./client");
    vi.mocked(apiRequest).mockResolvedValue({ ok: true });

    await getCustomerProfitability({
      operating_company_id: "co1",
      period_start: "2026-04-01",
      period_end: "2026-06-30",
      min_revenue_cents: 100000,
    });

    expect(apiRequest).toHaveBeenCalledWith(
      "/api/v1/reports/customer-profitability?period_start=2026-04-01&period_end=2026-06-30&min_revenue_cents=100000&operating_company_id=co1",
    );
  });

  it("getProfitPerTruck calls profit-per-truck period endpoint", async () => {
    const { apiRequest } = await import("./client");
    vi.mocked(apiRequest).mockResolvedValue({ ok: true });

    await getProfitPerTruck({
      operating_company_id: "co1",
      period_start: "2026-04-01",
      period_end: "2026-06-30",
    });

    expect(apiRequest).toHaveBeenCalledWith(
      "/api/v1/reports/profit-per-truck?period_start=2026-04-01&period_end=2026-06-30&operating_company_id=co1",
    );
  });

  it("propagates ApiError from client", async () => {
    const { apiRequest } = await import("./client");
    vi.mocked(apiRequest).mockRejectedValue(new ApiError(500, {}));

    await expect(
      getCashFlowOverview({ operating_company_id: "co1" }),
    ).rejects.toMatchObject({ status: 500 });
  });
});
