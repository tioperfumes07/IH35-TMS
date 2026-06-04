// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as cashAdvanceApi from "../../../api/cashAdvanceRequests";
import * as driverFinanceApi from "../../../api/driverFinance";
import * as liabilitiesApi from "../../../api/liabilities";
import { EarningsTab } from "../EarningsTab";

const companyId = "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071";
const driverId = "d1111111-1111-4111-8111-111111111111";

function wrap(ui: Parameters<typeof render>[0]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("EarningsTab", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(driverFinanceApi, "getDebtSummary").mockResolvedValue({
      driver_id: driverId,
      total_active_debt: 450,
      pending_ack_count: 1,
      pending_ack_total: 100,
      escrow_pre_clause: 0,
      escrow_post_clause: 0,
      computed_at: "2026-06-03T12:00:00.000Z",
      source_liabilities: [],
    });
    vi.spyOn(liabilitiesApi, "getLiabilitiesByDriver").mockResolvedValue({
      liabilities: [
        {
          id: "liab-1",
          type: "advance",
          source_description: "Cash advance",
          original_amount: 500,
          paid_to_date: 50,
          current_balance: 450,
          display_status: "active",
        },
      ],
    });
    vi.spyOn(driverFinanceApi, "listSettlements").mockResolvedValue({
      total_count: 2,
      settlements: [
        {
          id: "set-1",
          driver_id: driverId,
          driver_full_name: "Alex Driver",
          driver_display_id: "DRV-1",
          period_start: "2026-05-01",
          period_end: "2026-05-07",
          status: "paid",
          gross_pay: 1200,
          deductions_total: 200,
          net_pay: 1000,
          has_pending_acks: false,
          live_debt_flag: 450,
          debt_computed_at: "2026-06-03T12:00:00.000Z",
        },
        {
          id: "set-2",
          driver_id: driverId,
          driver_full_name: "Alex Driver",
          driver_display_id: "DRV-1",
          period_start: "2026-04-24",
          period_end: "2026-04-30",
          status: "paid",
          gross_pay: 900,
          deductions_total: 100,
          net_pay: 800,
          has_pending_acks: false,
          live_debt_flag: 0,
          debt_computed_at: null,
        },
      ],
    });
    vi.spyOn(cashAdvanceApi.cashAdvanceRequestsOfficeApi, "list").mockResolvedValue({
      requests: [{ id: "adv-1", driver_id: driverId, status: "approved", amount_cents: 50000 }],
    });
  });

  it("renders live debt and earnings summary", async () => {
    render(wrap(<EarningsTab driverId={driverId} operatingCompanyId={companyId} />));
    expect(await screen.findByTestId("driver-earnings-debt-tab")).toBeTruthy();
    expect(await screen.findByTestId("driver-earnings-total-debt")).toHaveTextContent("$450.00");
    expect(await screen.findByTestId("driver-earnings-ytd")).toHaveTextContent("$2100.00");
    expect(await screen.findByTestId("driver-earnings-settlement-set-1")).toBeTruthy();
  });

  it("links to canonical settlements page filtered by driver", async () => {
    render(wrap(<EarningsTab driverId={driverId} operatingCompanyId={companyId} />));
    const link = await screen.findByTestId("driver-earnings-settlements-link");
    expect(link.getAttribute("href")).toBe(`/driver-finance/settlements?driver_id=${driverId}`);
  });

  it("refresh triggers live debt recompute", async () => {
    render(wrap(<EarningsTab driverId={driverId} operatingCompanyId={companyId} />));
    await screen.findByTestId("driver-earnings-debt-tab");
    vi.mocked(driverFinanceApi.getDebtSummary).mockClear();
    fireEvent.click(screen.getByTestId("driver-earnings-debt-refresh"));
    await waitFor(() => {
      expect(driverFinanceApi.getDebtSummary).toHaveBeenCalled();
    });
  });
});
