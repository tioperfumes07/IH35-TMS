import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { CreateBillModal } from "../CreateBillModal";
import { ToastProvider } from "../../../../components/Toast";
import { createVendorBill } from "../../../../api/accounting";

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
vi.mock("../../../../components/parity/ReferenceSelect", () => ({
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
      data-testid="vendor-reference-select"
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
    await user.selectOptions(screen.getByTestId("vendor-reference-select"), VENDOR_ID);
    await user.click(screen.getByTestId("inject-lines"));

    const submit = screen.getByTestId("create-bill-submit");
    await waitFor(() => expect(submit).not.toBeDisabled());
    await user.click(submit);

    await waitFor(() => expect(createVendorBill).toHaveBeenCalledTimes(1));
    const [opId, body] = (createVendorBill as unknown as { mock: { calls: any[][] } }).mock.calls[0];
    expect(opId).toBe("91e0bf0a-133f-4ce8-a734-2586cfa66d96");
    expect(body.vendor_id).toBe(VENDOR_ID);
    expect(body.amount_cents).toBe(10825);
    expect(body.bill_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body.memo).toContain("WO: WO-TEST");
    expect(body.memo).toContain("terms:net_30");
    expect(body.work_order_id).toBe(WO_ID);
    expect(body.unit_id).toBe(UNIT_ID);
    expect(typeof body.attachment_draft_id).toBe("string");

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["accounting", "bills"] });
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
