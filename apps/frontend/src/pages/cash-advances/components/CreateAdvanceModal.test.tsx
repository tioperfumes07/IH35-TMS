/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CreateAdvanceModal } from "./CreateAdvanceModal";

vi.mock("../../../api/cashAdvances", () => ({
  createCashAdvance: vi.fn(),
  listUnpaidBills: vi.fn(async () => ({ bills: [] })),
}));

vi.mock("../../../api/mdata", () => ({
  listDrivers: vi.fn(async () => ({
    drivers: [{ id: "d1", first_name: "Juan", last_name: "Perez" }],
  })),
  listUnits: vi.fn(async () => ({ units: [] })),
}));

vi.mock("../../../api/loads", () => ({
  listLoads: vi.fn(async () => ({ loads: [], total_count: 0, has_more: false })),
  getLoad: vi.fn(async () => ({ id: "l1", assigned_unit_id: null })),
}));

vi.mock("../../../api/banking", () => ({
  getAllAccounts: vi.fn(async () => ({
    accounts: [
      {
        id: "bank-1",
        display_name: "Operating",
        institution_name: "IBC",
        account_mask: "1234",
      },
    ],
  })),
}));

vi.mock("../../../components/Toast", () => ({
  useToast: () => ({ pushToast: vi.fn() }),
}));

vi.mock("../../../components/drivers/CreateDriverModal", () => ({
  CreateDriverModal: () => null,
}));

function renderModal() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <CreateAdvanceModal open operatingCompanyId="c1" onClose={() => undefined} onCreated={() => undefined} />
    </QueryClientProvider>
  );
}

describe("CreateAdvanceModal — recovery mode UX", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("defaults to next-settlement full and hides amortize fields until selected", async () => {
    renderModal();
    expect(screen.getByText(/Next settlement — deduct in full/i)).toBeTruthy();
    expect(screen.queryByLabelText(/Per-period amount/i)).toBeNull();
    expect(screen.queryByText(/BOA \/ IBC/i)).toBeNull();

    fireEvent.click(screen.getByDisplayValue("amortize"));
    expect(await screen.findByLabelText(/Per-period amount/i)).toBeTruthy();
    const amortizeSection = document.querySelector('[data-section="amortize-schedule"]');
    expect(amortizeSection).toBeTruthy();
    expect(within(amortizeSection as HTMLElement).getByText(/^Periods$/)).toBeTruthy();
    expect(within(amortizeSection as HTMLElement).getByText(/^Cadence$/)).toBeTruthy();
  });

  it("shows bank account field for direct transfer and load field", async () => {
    renderModal();
    expect(document.querySelector('[data-field="from_bank_account_id"]')).toBeTruthy();
    expect(document.querySelector('[data-field="load_id"]')).toBeTruthy();
    expect(screen.getByTestId("advance-purpose")).toBeTruthy();
    expect(screen.getByText(/^Bank account$/)).toBeTruthy();
  });

  it("switching purpose to lumper shows load-expense economics (not amortize periods)", async () => {
    renderModal();
    const purposeBox = within(screen.getByTestId("advance-purpose")).getByRole("combobox");
    fireEvent.focus(purposeBox);
    fireEvent.click(await screen.findByRole("option", { name: /Lumper fee/i }));
    expect(await screen.findByText("Expense on load (not personal amortize)")).toBeTruthy();
    expect(document.querySelector('[data-section="lumper-economics"]')).toBeTruthy();
    expect(screen.queryByText(/Next settlement — deduct in full/i)).toBeNull();
  });
});
