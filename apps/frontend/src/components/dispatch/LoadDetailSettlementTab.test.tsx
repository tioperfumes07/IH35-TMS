import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LoadDetailSettlementTab } from "./LoadDetailSettlementTab";

vi.mock("../../api/client", () => ({
  apiRequest: vi.fn(),
}));

import { apiRequest } from "../../api/client";

const mockedApiRequest = vi.mocked(apiRequest);

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LoadDetailSettlementTab loadId="load-1" operatingCompanyId="co-1" currencyCode="USD" />
    </QueryClientProvider>
  );
}

describe("LoadDetailSettlementTab pay summary (ACCT-F10157)", () => {
  it("renders decimal-dollar gross and net without dividing by 100", async () => {
    mockedApiRequest.mockResolvedValue({
      settlement: {
        id: "settlement-1",
        display_id: "S-20260831-0010",
        status: "paid",
        is_open: false,
        driver_id: "driver-1",
        driver_name: "Test Driver",
        gross_pay: 120,
        deductions_total: 0,
        reimbursements_total: 0,
        net_pay: 120,
        period_start: null,
        period_end: null,
        nb_leg: { load_id: "load-1", load_number: "L-0010" },
        sb_leg: null,
      },
    });

    renderTab();

    expect(await screen.findByText("$120.00")).toBeInTheDocument();
    expect(screen.getByText("Gross pay").nextElementSibling).toHaveTextContent("$120.00");
    expect(screen.getByText("Net pay").nextElementSibling).toHaveTextContent("$120.00");
    expect(screen.queryByText("$1.20")).not.toBeInTheDocument();
  });
});
