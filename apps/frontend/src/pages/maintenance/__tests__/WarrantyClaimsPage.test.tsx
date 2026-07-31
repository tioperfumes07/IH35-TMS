import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { WarrantyClaimsPage } from "../WarrantyClaimsPage";

const listMaintenanceWarrantyClaims = vi.fn();
const createMaintenanceWarrantyClaim = vi.fn();
const fileMaintenanceWarrantyClaim = vi.fn();
const detectMaintenanceWarrantyFromWorkOrder = vi.fn();
// C1: the WO field is now <EntityPicker kind="work_order">, which lists the canonical
// maintenance.work_orders roster through this same module. The mock must provide it or the picker
// has no roster to select from.
const listWorkOrders = vi.fn();
// LST-PICKER-01/1858: vendor options now come from the CANONICAL mdata.vendors roster (the same
// table maintenance.warranty_claims.vendor_id FKs to), not catalogs.maintenance_vendors.
const listVendors = vi.fn();

vi.mock("../../../api/maintenance", () => ({
  listMaintenanceWarrantyClaims: (...args: unknown[]) => listMaintenanceWarrantyClaims(...args),
  createMaintenanceWarrantyClaim: (...args: unknown[]) => createMaintenanceWarrantyClaim(...args),
  fileMaintenanceWarrantyClaim: (...args: unknown[]) => fileMaintenanceWarrantyClaim(...args),
  detectMaintenanceWarrantyFromWorkOrder: (...args: unknown[]) => detectMaintenanceWarrantyFromWorkOrder(...args),
  listWorkOrders: (...args: unknown[]) => listWorkOrders(...args),
}));

vi.mock("../../../api/mdata", () => ({
  listVendors: (...args: unknown[]) => listVendors(...args),
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

// LST-PICKER-01/1858: same shim convention as CreateBillModal.test.tsx — a plain <select> stands in
// for the Combobox dropdown so the test can assert on the CANONICAL vendor options passed in, without
// re-testing Combobox's own keyboard/mouse interaction.
vi.mock("../../../components/parity/ReferenceSelect", () => ({
  ReferenceSelect: ({
    value,
    onChange,
    options,
    placeholder,
  }: {
    value: string | null;
    onChange: (v: string | null) => void;
    options: Array<{ value: string; label: string }>;
    placeholder?: string;
  }) => (
    <select
      aria-label={placeholder ?? "Vendor"}
      data-testid="warranty-vendor-reference-select"
      value={value ?? ""}
      onChange={(event) => onChange(event.target.value || null)}
    >
      <option value="">{placeholder ?? "Select…"}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
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
    listVendors.mockReset();
    createMaintenanceWarrantyClaim.mockReset();
    fileMaintenanceWarrantyClaim.mockReset();
    detectMaintenanceWarrantyFromWorkOrder.mockReset();
    listWorkOrders.mockReset();
    listWorkOrders.mockResolvedValue({
      work_orders: [{ id: "wo-123", display_id: "WO-101-IS-01-01-2026-0001-ABCDE", unit_number: "101", status: "open" }],
      total_count: 1,
    });

    listVendors.mockResolvedValue({
      vendors: [{ id: "vendor-1", name: "Fleet Parts Co", vendor_type: "parts" }],
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

  // C1 PICKER LAW. This test used to TYPE a raw id into a text box, which is exactly the defect the
  // block removes. It is tightened, not relaxed: the operator now PICKS a work order by its human
  // display id from the canonical roster, and the id sent to the API must be the canonical uuid —
  // proving the picker resolves label -> id rather than passing through whatever was typed.
  it("detect-from-WO selects a work order from the canonical roster and sends its id", async () => {
    detectMaintenanceWarrantyFromWorkOrder.mockResolvedValue({ eligible: [], created_claims: [] });
    const user = userEvent.setup();
    renderPage();

    const input = await screen.findByTestId("warranty-detect-wo-input");
    await user.click(input);
    await user.click(await screen.findByText("WO-101-IS-01-01-2026-0001-ABCDE"));
    await user.click(screen.getByTestId("warranty-detect-from-wo"));

    await waitFor(() => {
      expect(detectMaintenanceWarrantyFromWorkOrder).toHaveBeenCalledWith(
        expect.objectContaining({ work_order_id: "wo-123", create_draft_claims: true })
      );
    });
    // The roster read is company-scoped (VERIFY-5).
    expect(listWorkOrders).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111");
  });

  it("the WO field is a picker, not a raw-UUID box (C1 ratchet)", async () => {
    renderPage();
    expect(await screen.findByPlaceholderText("Select work order")).toBeTruthy();
    expect(screen.queryByPlaceholderText("Work order UUID")).toBeNull();
  });

  // LST-PICKER-01/1858 — the defect this fixes: the Vendor field used to list catalogs.maintenance_vendors
  // while maintenance.warranty_claims.vendor_id FKs to mdata.vendors, so every claim vendor_id 500'd on
  // the FK constraint (two different tables, two different uuid spaces). This proves the picker now
  // reads the canonical mdata.vendors roster (VERIFY-5 company-scoped) and the selected id round-trips
  // into the create payload unchanged.
  it("Vendor picker lists the canonical mdata.vendors roster and persists vendor_id on save", async () => {
    createMaintenanceWarrantyClaim.mockResolvedValue({ id: "claim-2" });
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: /\+ Create Claim/i }));

    await screen.findByRole("option", { name: "Fleet Parts Co" });
    expect(listVendors).toHaveBeenCalledWith(
      expect.objectContaining({ operating_company_id: "11111111-1111-4111-8111-111111111111" })
    );

    await user.type(screen.getByLabelText("Part description"), "Alternator");
    await user.selectOptions(screen.getByTestId("warranty-vendor-reference-select"), "vendor-1");

    await user.click(screen.getByRole("button", { name: "Save claim" }));

    await waitFor(() => expect(createMaintenanceWarrantyClaim).toHaveBeenCalledTimes(1));
    expect(createMaintenanceWarrantyClaim).toHaveBeenCalledWith(
      expect.objectContaining({ part_description: "Alternator", vendor_id: "vendor-1" })
    );
  });
});
