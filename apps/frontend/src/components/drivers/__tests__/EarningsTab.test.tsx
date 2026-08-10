// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as cashAdvanceApi from "../../../api/cashAdvanceRequests";
import * as driverFinanceApi from "../../../api/driverFinance";
import * as liabilitiesApi from "../../../api/liabilities";
import * as mdataApi from "../../../api/mdata";
import * as accountingApi from "../../../api/accounting";
import { EarningsTab } from "../EarningsTab";
import * as autoDeductionHooks from "../../../hooks/useAutoDeductionPolicies";

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
          display_id: "S-2026-0001",
          driver_id: driverId,
          driver_full_name: "Alex Driver",
          driver_display_id: "DRV-1",
          period_start: "2026-05-01",
          period_end: "2026-05-07",
          status: "paid",
          load_count: 3,
          gross_pay: 1200,
          deductions_total: 200,
          net_pay: 1000,
          has_pending_acks: false,
          live_debt_flag: 450,
          debt_computed_at: "2026-06-03T12:00:00.000Z",
        },
        {
          id: "set-2",
          display_id: "S-2026-0002",
          driver_id: driverId,
          driver_full_name: "Alex Driver",
          driver_display_id: "DRV-1",
          period_start: "2026-04-24",
          period_end: "2026-04-30",
          status: "paid",
          load_count: 2,
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
    vi.spyOn(autoDeductionHooks, "listAutoDeductionPolicies").mockResolvedValue({ rows: [] });
    vi.spyOn(mdataApi, "getDriverApVendor").mockResolvedValue({ vendor: null });
    vi.spyOn(accountingApi, "listVendorBills").mockResolvedValue({ rows: [] });
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

  it("links to liabilities + cash advances filtered by driver (Law §9 2026-07-22)", async () => {
    render(wrap(<EarningsTab driverId={driverId} operatingCompanyId={companyId} />));
    const liabilitiesLink = await screen.findByTestId("driver-earnings-liabilities-link");
    expect(liabilitiesLink.getAttribute("href")).toBe(`/liabilities?driver_id=${driverId}`);
    const advancesLink = await screen.findByTestId("driver-earnings-cash-advances-link");
    expect(advancesLink.getAttribute("href")).toBe(`/cash-advances?driver_id=${driverId}`);
  });

  it("renders honest-empty escrow tile with a drill into Operations escrow history", async () => {
    const onOpenOperationsView = vi.fn();
    render(
      wrap(
        <EarningsTab
          driverId={driverId}
          operatingCompanyId={companyId}
          onOpenOperationsView={onOpenOperationsView}
        />,
      ),
    );
    expect(await screen.findByTestId("driver-earnings-escrow-pre")).toHaveTextContent("$0.00");
    expect(await screen.findByTestId("driver-earnings-escrow-post")).toHaveTextContent("$0.00");
    fireEvent.click(await screen.findByTestId("driver-earnings-escrow-link"));
    expect(onOpenOperationsView).toHaveBeenCalledWith("escrow-history");
  });

  it("links pay rates to Equipment Assignments instead of a fabricated catalog FK", async () => {
    const onOpenEquipmentAssignments = vi.fn();
    render(
      wrap(
        <EarningsTab
          driverId={driverId}
          operatingCompanyId={companyId}
          onOpenEquipmentAssignments={onOpenEquipmentAssignments}
        />,
      ),
    );
    fireEvent.click(await screen.findByTestId("driver-earnings-pay-rates-link"));
    expect(onOpenEquipmentAssignments).toHaveBeenCalled();
  });

  it("FAIL-AP1: shows A/P vendor EntityLink when driver_id bridge exists", async () => {
    vi.mocked(mdataApi.getDriverApVendor).mockResolvedValue({
      vendor: {
        id: "v-ap-1",
        name: "Neftali Coronado Urbano",
        qbo_vendor_id: null,
        operating_company_id: companyId,
        driver_id: driverId,
      },
    });
    vi.mocked(accountingApi.listVendorBills).mockResolvedValue({
      rows: [
        {
          id: "bill-1",
          amount_cents: 50000,
          paid_cents: 0,
          balance_cents: 50000,
        } as accountingApi.VendorBill,
      ],
    });
    render(wrap(<EarningsTab driverId={driverId} operatingCompanyId={companyId} />));
    expect(await screen.findByTestId("driver-earnings-ap-vendor-link")).toBeTruthy();
    expect(await screen.findByTestId("driver-earnings-ap-vendor-open-total")).toHaveTextContent("$500.00");
    expect(screen.getByTestId("driver-earnings-ap-vendor-open").getAttribute("href")).toBe("/vendors/v-ap-1");
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
