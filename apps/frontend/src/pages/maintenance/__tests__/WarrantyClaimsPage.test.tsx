import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { WarrantyClaimsPage } from "../WarrantyClaimsPage";

const listMaintenanceWarrantyClaims = vi.fn();
const listMaintenanceVendors = vi.fn();
const createMaintenanceWarrantyClaim = vi.fn();
const fileMaintenanceWarrantyClaim = vi.fn();
const detectMaintenanceWarrantyFromWorkOrder = vi.fn();

vi.mock("../../../api/maintenance", () => ({
  listMaintenanceWarrantyClaims: (...args: unknown[]) => listMaintenanceWarrantyClaims(...args),
  listMaintenanceVendors: (...args: unknown[]) => listMaintenanceVendors(...args),
  createMaintenanceWarrantyClaim: (...args: unknown[]) => createMaintenanceWarrantyClaim(...args),
  fileMaintenanceWarrantyClaim: (...args: unknown[]) => fileMaintenanceWarrantyClaim(...args),
  detectMaintenanceWarrantyFromWorkOrder: (...args: unknown[]) => detectMaintenanceWarrantyFromWorkOrder(...args),
}));

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({
    selectedCompanyId: "11111111-1111-4111-8111-111111111111",
    companies: [{ id: "11111111-1111-4111-8111-111111111111", name: "IH35" }],
  }),
}));

vi.mock("../../../components/Toast", () => ({
  useToast: () => ({ pushToast: vi.fn() }),
}));

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <WarrantyClaimsPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Maintenance WarrantyClaimsPage (B33)", () => {
  beforeEach(() => {
    listMaintenanceWarrantyClaims.mockReset();
    listMaintenanceVendors.mockReset();
    createMaintenanceWarrantyClaim.mockReset();
    fileMaintenanceWarrantyClaim.mockReset();
    detectMaintenanceWarrantyFromWorkOrder.mockReset();

    listMaintenanceVendors.mockResolvedValue({
      rows: [{ id: "vendor-1", display_name: "Fleet Parts Co" }],
    });
    listMaintenanceWarrantyClaims.mockResolvedValue({
      rows: [
        {
          id: "claim-1",
          part_description: "Alternator",
          vendor_name: "Fleet Parts Co",
          claim_number: "",
          status: "draft",
          status_label: "Draft",
          claim_amount_cents: 45000,
        },
      ],
    });
  });

  it("renders warranty claims shell with create action", async () => {
    renderPage();
    expect(screen.getByTestId("maint-warranty-claims-page")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /\+ Create Claim/i })).toBeInTheDocument();
    expect(await screen.findByTestId("warranty-claims-table")).toBeInTheDocument();
  });

  it("shows claims table with file claim action for drafts", async () => {
    renderPage();
    expect(await screen.findByText("Alternator")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "File claim" })).toBeInTheDocument();
  });

  it("exposes detect-from-WO control", async () => {
    detectMaintenanceWarrantyFromWorkOrder.mockResolvedValue({ eligible: [], created_claims: [] });
    const user = userEvent.setup();
    renderPage();
    const input = screen.getByTestId("warranty-detect-wo-input");
    await user.type(input, "wo-123");
    await user.click(screen.getByTestId("warranty-detect-from-wo"));
    await waitFor(() => {
      expect(detectMaintenanceWarrantyFromWorkOrder).toHaveBeenCalledWith(
        expect.objectContaining({ work_order_id: "wo-123", create_draft_claims: true })
      );
    });
  });
});
