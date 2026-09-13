import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as accountingApi from "../../../api/accounting";
import type { ApAgingVendor } from "../../../api/accounting";
import { AccountsPayableAgingPage } from "../AccountsPayableAgingPage";

const COMPANY_ID = "00000000-0000-4000-8000-000000000099";

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: COMPANY_ID }),
}));

vi.mock("../AccountingSubNavWrapper", () => ({
  AccountingSubNavWrapper: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("../../../components/shared/EntityLink", () => ({
  EntityLink: ({ label }: { label: string }) => <span>{label}</span>,
}));

function vendor(overrides: Partial<ApAgingVendor>): ApAgingVendor {
  return {
    vendor_id: null,
    vendor_name: "Vendor",
    display_group: "Other",
    current: 0,
    d1_30: 0,
    d31_60: 0,
    d61_90: 0,
    d90_plus: 0,
    total_outstanding: 0,
    ...overrides,
  };
}

// One vendor with ONLY a Current balance, one with ONLY a 61-90 balance — the minimal fixture that
// proves the 61-90 tile narrows to exactly the second vendor and leaves the first out.
const CURRENT_ONLY = vendor({ vendor_id: "v-current", vendor_name: "Current Only Co", current: 10_000, total_outstanding: 10_000 });
const D61_90_ONLY = vendor({ vendor_id: "v-6190", vendor_name: "Sixty Ninety Co", d61_90: 25_000, total_outstanding: 25_000 });

function wrap(ui: ReactElement) {
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={["/accounting/accounts-payable"]}>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("AccountsPayableAgingPage — A5 item 4 aging-bucket clickable filter tiles", () => {
  beforeEach(() => {
    vi.spyOn(accountingApi, "getApAgingByVendor").mockResolvedValue({
      vendors: [CURRENT_ONLY, D61_90_ONLY],
      totals: {
        current: 10_000,
        d1_30: 0,
        d31_60: 0,
        d61_90: 25_000,
        d90_plus: 0,
        total_outstanding: 35_000,
      },
      empty_state: "has_rows",
    } as never);
  });

  it("renders one clickable tile per real bucket (not Total) showing the full type-filtered sum", async () => {
    render(wrap(<AccountsPayableAgingPage />));
    await screen.findByTestId("ap-aging-by-vendor-table");

    const tiles = screen.getByTestId("ap-aging-bucket-filter-tiles");
    expect(within(tiles).getByTestId("ap-aging-bucket-tile-current")).toBeInTheDocument();
    expect(within(tiles).getByTestId("ap-aging-bucket-tile-d61_90")).toBeInTheDocument();
    // "Total" is a sum, not a bucket a vendor can be filtered into — must not get its own tile.
    expect(within(tiles).queryByTestId("ap-aging-bucket-tile-total")).not.toBeInTheDocument();
    expect(within(tiles).getByTestId("ap-aging-bucket-tile-d61_90")).toHaveTextContent("$250.00");
  });

  it("clicking the 61-90 tile narrows the by-vendor grid to only the vendor with a 61-90 balance", async () => {
    const user = userEvent.setup();
    render(wrap(<AccountsPayableAgingPage />));
    const table = await screen.findByTestId("ap-aging-by-vendor-table");
    expect(within(table).getByText("Current Only Co")).toBeInTheDocument();
    expect(within(table).getByText("Sixty Ninety Co")).toBeInTheDocument();

    await user.click(screen.getByTestId("ap-aging-bucket-tile-d61_90"));

    expect(within(table).queryByText("Current Only Co")).not.toBeInTheDocument();
    expect(within(table).getByText("Sixty Ninety Co")).toBeInTheDocument();
    expect(screen.getByTestId("ap-aging-bucket-tile-d61_90")).toHaveAttribute("aria-pressed", "true");

    // The tile's own dollar figure never moves when it's the active filter — it's always the full sum.
    expect(screen.getByTestId("ap-aging-bucket-tile-d61_90")).toHaveTextContent("$250.00");
  });

  it("clicking an active tile again (or Clear) restores every vendor", async () => {
    const user = userEvent.setup();
    render(wrap(<AccountsPayableAgingPage />));
    const table = await screen.findByTestId("ap-aging-by-vendor-table");
    await user.click(screen.getByTestId("ap-aging-bucket-tile-d61_90"));
    expect(within(table).queryByText("Current Only Co")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("ap-aging-bucket-tile-clear"));
    expect(within(table).getByText("Current Only Co")).toBeInTheDocument();
    expect(within(table).getByText("Sixty Ninety Co")).toBeInTheDocument();
    expect(screen.queryByTestId("ap-aging-bucket-tile-clear")).not.toBeInTheDocument();
  });
});
