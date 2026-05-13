import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkOrderDetailPage } from "./WorkOrderDetailPage";

vi.mock("../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({
    selectedCompanyId: "test-operating-co",
    companies: [],
    selectedCompany: null,
    isLoading: false,
    setSelectedCompany: vi.fn(),
    setDefaultCompanyForUser: vi.fn(async () => {}),
  }),
}));

const getWorkOrder = vi.fn(() =>
  Promise.resolve({
    id: "wo-pilot-id",
    display_id: "WO-PILOT-TEST",
    status: "open",
    source_type: "IS",
    unit_id: "T169",
  }),
);

vi.mock("../../api/maintenance", () => ({
  getWorkOrder: (...args: unknown[]) => getWorkOrder(...args),
}));

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/maintenance/work-orders/wo-pilot-id"]}>
        <Routes>
          <Route path="/maintenance/work-orders/:id" element={<WorkOrderDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("WorkOrderDetailPage (invariant #21 pilot)", () => {
  beforeEach(() => {
    getWorkOrder.mockClear();
  });

  it("renders back control, breadcrumb, and H1 with display id", async () => {
    renderPage();

    const back = await screen.findByTestId("page-header-back");
    expect(back.getAttribute("href")).toBe("/maintenance");

    expect(screen.getByTestId("page-header-breadcrumb")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Work Order WO-PILOT-TEST");
    const crumb = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(crumb.textContent).toContain("Maintenance");
    expect(crumb.textContent).toContain("Work Orders");
    expect(crumb.textContent).toContain("WO-PILOT-TEST");
    expect(getWorkOrder).toHaveBeenCalledWith("wo-pilot-id", "test-operating-co");
  });
});
