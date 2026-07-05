import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { CreateBillModal } from "../CreateBillModal";
import { ToastProvider } from "../../../../components/Toast";
import { createVendorBill } from "../../../../api/accounting";

const VENDOR_ID = "11111111-1111-4111-8111-111111111111";

// Persistence is the point of this modal (D2-1 reversal): assert the Save button actually fires the
// canonical createVendorBill mutation with a real payload — a static guard that this is NOT a no-op stub.
vi.mock("../../../../api/accounting", () => ({
  createVendorBill: vi.fn(() => Promise.resolve({ bill: { id: "bill-1" } })),
}));
vi.mock("../../../../api/mdata", () => ({
  listVendors: vi.fn(() => Promise.resolve({ vendors: [{ id: VENDOR_ID, name: "Ace Parts" }] })),
  listDrivers: vi.fn(() => Promise.resolve({ drivers: [] })),
  listUnits: vi.fn(() => Promise.resolve({ units: [] })),
}));

// Keep heavy children deterministic; the line editor exposes a button the test clicks to inject a
// Section-A line so the bill total is positive (the Save button is disabled at zero).
vi.mock("../../../../components/Modal", () => ({
  Modal: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div data-testid="modal">{children}</div> : null,
}));
vi.mock("../../../../components/forms/TwoSectionLineEditor", () => ({
  TwoSectionLineEditor: ({ onChange }: { onChange: (lines: unknown[]) => void }) => (
    <button
      type="button"
      data-testid="inject-lines"
      onClick={() => onChange([{ id: "l1", section: "A", description: "brake pads", amount: 100 }])}
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

function renderModal(onClose = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateSpy = vi.spyOn(client, "invalidateQueries");
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <CreateBillModal
          open={true}
          operatingCompanyId="91e0bf0a-133f-4ce8-a734-2586cfa66d96"
          linkedWoDisplayId="WO-TEST"
          onClose={onClose}
        />
      </ToastProvider>
    </QueryClientProvider>
  );
  return { onClose, invalidateSpy };
}

describe("CreateBillModal — persists via the canonical createVendorBill endpoint", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fires createVendorBill with the bill payload incl. the WO maintenance link, then closes + invalidates", async () => {
    const { onClose, invalidateSpy } = renderModal();

    // vendor is required
    const vendorOption = await screen.findByRole("option", { name: "Ace Parts" });
    fireEvent.change(vendorOption.closest("select")!, { target: { value: VENDOR_ID } });
    // positive amount
    fireEvent.click(screen.getByTestId("inject-lines"));

    fireEvent.click(screen.getByTestId("create-bill-submit"));

    await waitFor(() => expect(createVendorBill).toHaveBeenCalledTimes(1));
    const [opId, body] = (createVendorBill as unknown as { mock: { calls: any[][] } }).mock.calls[0];
    expect(opId).toBe("91e0bf0a-133f-4ce8-a734-2586cfa66d96");
    expect(body.vendor_id).toBe(VENDOR_ID);
    expect(body.amount_cents).toBe(10825); // 100 + 8.25% tax
    expect(body.bill_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body.memo).toContain("WO: WO-TEST"); // maintenance linkage
    expect(typeof body.attachment_draft_id).toBe("string");

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["accounting", "bills"] });
  });

  it("does not submit without a vendor (guarded)", () => {
    renderModal();
    fireEvent.click(screen.getByTestId("inject-lines"));
    // vendor not selected → button disabled → no call
    fireEvent.click(screen.getByTestId("create-bill-submit"));
    expect(createVendorBill).not.toHaveBeenCalled();
  });
});
