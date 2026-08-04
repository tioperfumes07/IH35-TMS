import type { ComponentProps } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  EditVehicleModal,
  EDIT_VEHICLE_MODAL_TABS,
  EDIT_VEHICLE_MODAL_FIELD_COUNT,
  hasReeferLinkage,
} from "../EditVehicleModal";

vi.mock("../../../api/client", () => ({
  apiRequest: vi.fn(),
}));

vi.mock("../../../api/mdata", () => ({
  patchUnit: vi.fn(),
}));

vi.mock("../../../api/org", () => ({
  listMyCompanies: vi.fn().mockResolvedValue({
    companies: [
      { id: "company-1", code: "TRANSP", legal_name: "Transport", short_name: "TRANSP", company_type: "operating_carrier", is_active: true, is_default: true },
      { id: "company-2", code: "TRK", legal_name: "Trucking", short_name: "TRK", company_type: "asset_holder", is_active: true, is_default: false },
    ],
  }),
}));

import { apiRequest } from "../../../api/client";

const mockedApiRequest = vi.mocked(apiRequest);

function renderModal(props: Partial<ComponentProps<typeof EditVehicleModal>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <EditVehicleModal
        open
        unitId="unit-1"
        operatingCompanyId="company-1"
        onClose={vi.fn()}
        {...props}
      />
    </QueryClientProvider>
  );
}

describe("EditVehicleModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedApiRequest.mockResolvedValue({
      unit: { id: "unit-1", unit_number: "TRK-1", status: "InService", make: "Freightliner" },
      reefer: null,
    });
  });

  it("renders all 8 tab labels", async () => {
    renderModal();
    for (const tab of EDIT_VEHICLE_MODAL_TABS) {
      if (tab === "Reefer") continue;
      expect(await screen.findByRole("button", { name: tab })).toBeTruthy();
    }
  });

  it("hides Reefer tab when no reefer linkage", async () => {
    renderModal();
    await screen.findByText("Edit Vehicle · TRK-1");
    expect(screen.queryByRole("button", { name: "Reefer" })).toBeNull();
    expect(hasReeferLinkage({ vehicle_type: "Day Cab" }, null)).toBe(false);
  });

  it("hides Sold sub-section fields when status is not Sold", async () => {
    renderModal();
    await screen.findByText("Edit Vehicle · TRK-1");
    fireEvent.click(screen.getByRole("button", { name: "Lifecycle" }));
    expect(screen.queryByLabelText(/Sale Price/i)).toBeNull();
  });

  it("Save button reflects modified field count", async () => {
    renderModal();
    await screen.findByText("Edit Vehicle · TRK-1");
    const saveBtn = screen.getByRole("button", { name: /Save Changes \(0 fields modified\)/ });
    expect(saveBtn).toBeTruthy();
    expect(EDIT_VEHICLE_MODAL_FIELD_COUNT).toBeGreaterThanOrEqual(50);
  });

  it("uses company Combobox for owner / leased-to (not raw UUID text)", async () => {
    renderModal();
    await screen.findByText("Edit Vehicle · TRK-1");
    expect(screen.getByTestId("edit-vehicle-owner_company_id")).toBeTruthy();
    expect(screen.getByTestId("edit-vehicle-currently_leased_to_company_id")).toBeTruthy();
    expect(screen.queryByLabelText(/Owner Company ID/i)).toBeNull();
  });
});
