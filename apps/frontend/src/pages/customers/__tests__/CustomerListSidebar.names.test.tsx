import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { CustomerListSidebar } from "../CustomerListSidebar";

describe("Customers › Directory display names (row 225 / D049)", () => {
  it("ACME FREIGHT LLC → Acme Freight LLC; mixed-case kept", () => {
    const props = {
      customers: [
        { id: "11111111-1111-4111-8111-111111111111", name: "ACME FREIGHT LLC", customer_code: "C1" },
        { id: "22222222-2222-4222-8222-222222222222", name: "FedEx Freight", customer_code: "C2" },
      ],
      status: "success",
      totalCount: 2,
      page: 0,
      pageSize: 50,
      search: "",
      sortByName: "name_asc",
      selectedCustomerId: "",
      openByCustomerId: new Map(),
      unclearedByCustomerId: new Map(),
      openBalancesAvailable: true,
      onSearchChange: vi.fn(),
      onSortChange: vi.fn(),
      onPageChange: vi.fn(),
      onPageSizeChange: vi.fn(),
      onSelectCustomer: vi.fn(),
    } as unknown as Parameters<typeof CustomerListSidebar>[0];
    render(
      <MemoryRouter>
        <CustomerListSidebar {...props} />
      </MemoryRouter>,
    );
    expect(screen.getByText("Acme Freight LLC")).toBeInTheDocument();
    expect(screen.getByText("FedEx Freight")).toBeInTheDocument();
    expect(screen.queryByText("ACME FREIGHT LLC")).toBeNull();
  });
});
