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

// ECON-014 — 4 owner-seeded catalog codes (ROUTE/EQUIPMENT/MEDICAL/OTHER) all map to the SAME
// coarse `purpose` enum value ("other"); this mock reproduces that exact live shape so the test
// below proves they still render as 4 distinct, independently-selectable options.
const CATALOG_ROWS = [
  { id: "t1", code: "FUEL", display_name: "Fuel deposit", description: null },
  { id: "t2", code: "EMERGENCY", display_name: "Family emergency", description: null },
  { id: "t3", code: "ROUTE", display_name: "Route advance", description: null },
  { id: "t4", code: "EQUIPMENT", display_name: "Equipment advance", description: null },
  { id: "t5", code: "MEDICAL", display_name: "Medical advance", description: null },
  { id: "t6", code: "OTHER", display_name: "Other advance", description: null },
];

vi.mock("../../../api/catalogs-driver", () => ({
  cashAdvanceTypesCatalogClient: {
    list: vi.fn(async () => ({ rows: CATALOG_ROWS, total: CATALOG_ROWS.length })),
  },
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

  // ECON-014 — regression: ROUTE/EQUIPMENT/MEDICAL/OTHER all map to the same coarse `purpose`
  // value ("other"). Before the fix, purposeOptions deduped BY that mapped value and kept only
  // the first catalog row that mapped to "other" — the other 3 real, office-seeded catalog types
  // never rendered as options at all. This proves all 6 distinct catalog rows stay selectable.
  it("keeps every catalog row selectable even when several codes share the same purpose bucket", async () => {
    renderModal();
    const purposeBox = within(screen.getByTestId("advance-purpose")).getByRole("combobox");
    fireEvent.focus(purposeBox);
    expect(await screen.findByRole("option", { name: "Route advance" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Equipment advance" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Medical advance" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Other advance" })).toBeTruthy();

    // Selecting a specific "other"-bucket catalog row must track its OWN code, not silently
    // collapse to whichever "other" row happened to load first.
    fireEvent.click(screen.getByRole("option", { name: "Medical advance" }));
    expect(await screen.findByTestId("advance-type-code")).toHaveTextContent("MEDICAL");

    fireEvent.focus(purposeBox);
    fireEvent.click(await screen.findByRole("option", { name: "Equipment advance" }));
    expect(await screen.findByTestId("advance-type-code")).toHaveTextContent("EQUIPMENT");
  });
});
