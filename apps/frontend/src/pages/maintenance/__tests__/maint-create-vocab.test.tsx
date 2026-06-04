import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../../components/Toast";
import { ActionBar } from "../../../components/vehicle-profile/ActionBar";
import { ConvertIssueToWOModal } from "../components/ConvertIssueToWOModal";
import { PartsMasterDataPage } from "../parts/PartsMasterDataPage";
import { FaultRulesPage } from "../FaultRulesPage";

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({
    selectedCompanyId: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071",
    companies: [],
    selectedCompany: null,
    isLoading: false,
    setSelectedCompany: vi.fn(),
    setDefaultCompanyForUser: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock("../../../api/maintenance", () => ({
  listMaintenanceParts: vi.fn().mockResolvedValue({ rows: [] }),
  getMaintenancePartsKpis: vi.fn().mockResolvedValue({ total_parts: 0, low_stock_count: 0, total_inventory_value: 0 }),
  getMaintenancePartsTemplateUrl: vi.fn().mockReturnValue("/template"),
}));

vi.mock("../../../api/client", () => ({
  apiRequest: vi.fn().mockResolvedValue({ rules: [] }),
}));

function wrap(ui: ReactElement, initialEntries = ["/maintenance/fault-rules"]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={initialEntries}>
        <ToastProvider>{ui}</ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("maintenance create vocabulary (B25)", () => {
  it("PartsMasterDataPage exposes + Create Part", () => {
    render(wrap(<PartsMasterDataPage />, ["/maintenance/parts"]));
    expect(screen.getByRole("button", { name: "+ Create Part" })).toBeInTheDocument();
  });

  it("FaultRulesPage exposes + Create Rule", async () => {
    render(wrap(<FaultRulesPage />));
    expect(await screen.findByRole("button", { name: "+ Create Rule" })).toBeInTheDocument();
  });

  it("ConvertIssueToWOModal confirm button says + Create Work Order", () => {
    render(
      wrap(
        <ConvertIssueToWOModal
          open
          operatingCompanyId="91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071"
          card={{
            load_id: "load-1",
            load_display_id: "LD-1",
            unit_number: "T169",
            driver_name: "Driver",
            suggested_wo_source_type: "IS",
            issues: [{ issue_id: "issue-1", description: "Brake", severity: "high" }],
          }}
          onClose={() => undefined}
          onDone={() => undefined}
        />,
        ["/maintenance"]
      )
    );
    expect(screen.getByRole("button", { name: "+ Create Work Order" })).toBeInTheDocument();
  });

  it("vehicle ActionBar links to work-orders/new with unit_id", () => {
    const unitId = "unit-abc-123";
    render(
      wrap(
        <ActionBar unitId={unitId} companyId="co-1" unitNumber="T169" />,
        [`/fleet/${unitId}`]
      )
    );
    const link = screen.getByTestId("vp-create-work-order");
    expect(link).toHaveTextContent("+ Create Work Order");
    expect(link).toHaveAttribute("href", `/maintenance/work-orders/new?unit_id=${encodeURIComponent(unitId)}`);
  });
});
