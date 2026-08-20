import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { CreateBillModal } from "../CreateBillModal";
import { ToastProvider } from "../../../../components/Toast";
import { createVendorBill } from "../../../../api/accounting";
import { MemoryRouter } from "react-router-dom";

const CATEGORY_ID = "33333333-3333-4333-8333-333333333333";
const VENDOR_ID = "11111111-1111-4111-8111-111111111111";
const WO_ID = "22222222-2222-4222-8222-222222222222";
const UNIT_ID = "33333333-3333-4333-8333-333333333333";

vi.mock("../../../../api/accounting", () => ({
  createVendorBill: vi.fn(() => Promise.resolve({ bill: { id: "bill-1" } })),
}));
vi.mock("../../../../api/mdata", () => ({
  listVendors: vi.fn(() => Promise.resolve({ vendors: [{ id: VENDOR_ID, name: "Ace Parts" }] })),
  listDrivers: vi.fn(() => Promise.resolve({ drivers: [] })),
  listUnits: vi.fn(() => Promise.resolve({ units: [{ id: UNIT_ID, unit_number: "T-101" }] })),
  // A vi.mock factory REPLACES the module, so every export the component reaches must be listed here —
  // an omitted one is GONE, not passed through, and vitest fails with "No export is defined on the mock".
  createDriver: vi.fn(),
  createVendor: vi.fn(),
}));

vi.mock("../../../../components/parity/ParityDrawer", () => ({
  ParityDrawer: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div data-testid="parity-drawer">{children}</div> : null,
}));
vi.mock("../../../../components/forms/TwoSectionLineEditor", () => ({
  TwoSectionLineEditor: ({ onChange }: { onChange: (lines: unknown[]) => void }) => (
    <button
      type="button"
      data-testid="inject-lines"
      // Section A lines must carry an expense category — VendorBillForm blocks submit with
      // "Each Category (Section A) line needs an expense category." Without it the stub produced an
      // unsubmittable bill and the failure looked like "createVendorBill never called".
      onClick={() =>
        onChange([
          { id: "l1", section: "A", description: "brake pads", amount: 100, expense_category_uuid: CATEGORY_ID },
        ])
      }
    >
      inject
    </button>
  ),
}));
vi.mock("../../../../components/forms/shared/TotalsStack", () => ({ TotalsStack: () => <div /> }));
vi.mock("../../../../components/UploadZone", () => ({ UploadZone: () => <div /> }));
vi.mock("../../../../components/forms/QboCombobox", () => ({ QboCombobox: () => <div data-testid="qbo" /> }));
vi.mock("../../../../components/shared/SelectCombobox", () => ({
  SelectCombobox: ({ value, onChange, children, className }: any) => (
    <select className={className} value={value} onChange={onChange}>
      {children}
    </select>
  ),
}));
vi.mock("../../../../components/parity/ReferenceSelect", () => ({
  ReferenceSelect: ({
    value,
    onChange,
    options,
    placeholder,
    createKind,
  }: {
    value: string | null;
    onChange: (v: string | null) => void;
    options: Array<{ value: string; label: string }>;
    placeholder?: string;
    createKind?: string;
  }) => (
    <select
      aria-label={placeholder ?? "Vendor"}
      // Derive the testid per picker: the modal renders MORE THAN ONE ReferenceSelect now, and a
      // hardcoded id made getByTestId ambiguous ("Found multiple elements"), which reads as a duplicate
      // control rather than a mock that labels every picker identically.
      data-testid={`${createKind ?? "vendor"}-reference-select`}
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

function renderModal(onClose = vi.fn(), extra?: { linkedUnitId?: string }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateSpy = vi.spyOn(client, "invalidateQueries");
  render(
    <QueryClientProvider client={client}>
      {/* These modals use react-router now; with no Router in scope React Router throws
          "Cannot destructure property 'basename'", which reads as a component crash rather than a
          missing test wrapper. */}
      <MemoryRouter>
      <ToastProvider>
        <CreateBillModal
          open={true}
          operatingCompanyId="91e0bf0a-133f-4ce8-a734-2586cfa66d96"
          linkedWoDisplayId="WO-TEST"
          linkedWoId={WO_ID}
          linkedUnitId={extra?.linkedUnitId}
          onClose={onClose}
        />
      </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return { onClose, invalidateSpy };
}

describe("CreateBillModal — persists via the canonical createVendorBill endpoint", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fires createVendorBill with the bill payload incl. the WO maintenance link, then closes + invalidates", async () => {
    const user = userEvent.setup();
    const { onClose, invalidateSpy } = renderModal(vi.fn(), { linkedUnitId: UNIT_ID });

    await screen.findByRole("option", { name: "Ace Parts" });
    fireEvent.change(screen.getByTestId("vendor-reference-select"), { target: { value: VENDOR_ID } });
    await user.click(screen.getByTestId("inject-lines"));

    const submit = screen.getByTestId("create-bill-submit");
    await waitFor(() => expect(submit).not.toBeDisabled());
    await user.click(submit);

    await waitFor(() => expect(createVendorBill).toHaveBeenCalledTimes(1));
    const [opId, body] = (createVendorBill as unknown as { mock: { calls: any[][] } }).mock.calls[0];
    expect(opId).toBe("91e0bf0a-133f-4ce8-a734-2586cfa66d96");
    expect(body.vendor_id).toBe(VENDOR_ID);
    // The bill amount is the SUM OF LINES — tax is display-only until a tax expense line with a real CoA
    // account is entered ("no invented tax GL", stated in the form itself). This expected 10825 (100.00 plus
    // 8.25% folded in), which encodes the pre-change behaviour where tax was invented into the header.
    expect(body.amount_cents).toBe(10000);
    expect(body.bill_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body.memo).toContain("WO: WO-TEST");
    expect(body.memo).toContain("terms:net_30");
    expect(body.work_order_id).toBe(WO_ID);
    expect(body.unit_id).toBe(UNIT_ID);
    expect(typeof body.attachment_draft_id).toBe("string");
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["accounting", "bills"] });

    // LINK-F5189: the modal holds a confirmation step (real EntityLink to the just-created bill)
    // instead of closing straight past it — onClose only fires once the operator dismisses it.
    await screen.findByTestId("create-bill-modal-view-bill");
    await user.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("does not submit without a vendor (guarded)", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByTestId("inject-lines"));
    const submit = screen.getByTestId("create-bill-submit");
    expect(submit).toBeDisabled();
    await user.click(submit);
    expect(createVendorBill).not.toHaveBeenCalled();
  });
});
