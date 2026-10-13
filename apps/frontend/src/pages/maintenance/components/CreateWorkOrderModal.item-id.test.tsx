import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CreateWorkOrderModal } from "./CreateWorkOrderModal";
import { ToastProvider } from "../../../components/Toast";
import type { TwoSectionLine } from "../../../components/forms/TwoSectionLineEditor";

// ACCT-F4431382 — the WO -> A/P bill copy posts every bill line to its work-order line's ITEM account and refuses a
// line with no item (wo_line_item_required, CC-3 #26704). So the create payload must carry item_id on every line:
// Section A (category line) -> its item; Section B -> its service item (part / labor rows inherit it on the copy).
// FAILS on origin/main's modal: sectionA/sectionB were sent with no item_id, and an itemless line saved anyway.

const createWorkOrder = vi.fn((_payload: unknown) => Promise.resolve({ wo: { uuid: "wo-1", display_id: "WO-1" } }));

vi.mock("../../../api/maintenance", () => ({
  createWorkOrder: (payload: unknown) => createWorkOrder(payload),
  suggestExpenseLoad: vi.fn(() => Promise.resolve({ data: null })),
  listMaintenanceVehicles: vi.fn(() => Promise.resolve({ rows: [] })),
  listMaintenanceDrivers: vi.fn(() => Promise.resolve({ rows: [] })),
  getWoCostContext: vi.fn(() => Promise.resolve({ data: {} })),
}));
vi.mock("../../../api/identity", () => ({
  listUsers: () => Promise.resolve({ users: [] }),
  listAssignableUsers: () => Promise.resolve({ users: [] }),
}));
vi.mock("../../../api/catalogs-fleet", () => ({
  tirePositionsCatalogClient: { list: () => Promise.resolve({ rows: [] }) },
}));
vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({
    companies: [],
    selectedCompanyId: COMPANY,
    selectedCompany: null,
    isLoading: false,
    setSelectedCompany: () => {},
    setDefaultCompanyForUser: () => Promise.resolve(),
  }),
}));

// The line editor is driven by its onChange contract — the modal's OWN payload builder + pre-save checks are under test.
let emitLines: TwoSectionLine[] = [];
vi.mock("../../../components/forms/TwoSectionLineEditor", () => ({
  TwoSectionLineEditor: ({ onChange }: { onChange: (lines: TwoSectionLine[]) => void }) => (
    <button type="button" data-testid="emit-lines" onClick={() => onChange(emitLines)}>
      emit
    </button>
  ),
}));

const COMPANY = "91e0bf0a-133f-4ce8-a734-2586cfa66d96";
const UNIT = "0b7a6b8e-5f8f-4d55-9a49-2a1f2e3c4d5e";

const sectionALine = (over: Partial<TwoSectionLine> = {}): TwoSectionLine => ({
  id: "a-1",
  section: "A",
  description: "Shop supplies",
  quantity: 1,
  unit_cost: 25,
  amount: 25,
  expense_category_uuid: "acct-shop-supplies",
  item_id: "item-shop-supplies",
  ...over,
});
const sectionBLine = (over: Partial<TwoSectionLine> = {}): TwoSectionLine => ({
  id: "b-1",
  section: "B",
  description: "Brake job",
  quantity: 1,
  unit_cost: 0,
  amount: 0,
  service_item_uuid: "item-brake-service",
  sub_rows: [
    { id: "s-1", line_type: "parts", description: "Pads", quantity: 2, unit_cost: 40, amount: 80 },
    { id: "s-2", line_type: "labor", description: "Labor", quantity: 1, unit_cost: 95, amount: 95 },
  ],
  ...over,
});

function renderCreate() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ToastProvider>
          <CreateWorkOrderModal
            open={true}
            operatingCompanyId={COMPANY}
            initialType="pm"
            initialValues={{ unit_id: UNIT, payment_timing: "in_house", repair_location: "in_house", description: "PM" }}
            onClose={() => {}}
            onCreated={() => {}}
          />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("CreateWorkOrderModal — every cost line carries its item (ACCT-F4431382)", () => {
  beforeEach(() => {
    createWorkOrder.mockClear();
  });

  it("the create payload carries item_id on the Section A line and the Section B line", async () => {
    emitLines = [sectionALine(), sectionBLine()];
    renderCreate();
    fireEvent.click(screen.getByTestId("emit-lines"));
    await waitFor(() => expect(screen.getByTestId("wo-create-btn")).not.toBeDisabled());
    fireEvent.click(screen.getByTestId("wo-create-btn"));
    await waitFor(() => expect(createWorkOrder).toHaveBeenCalledTimes(1));
    const payload = createWorkOrder.mock.calls[0][0] as {
      sectionA: Array<{ item_id?: string; expense_category_uuid: string }>;
      sectionB: Array<{ item_id?: string; service_item_uuid?: string; sub_rows: unknown[] }>;
    };
    expect(payload.sectionA).toHaveLength(1);
    expect(payload.sectionA[0].item_id).toBe("item-shop-supplies");
    expect(payload.sectionA[0].expense_category_uuid).toBe("acct-shop-supplies");
    expect(payload.sectionB).toHaveLength(1);
    expect(payload.sectionB[0].item_id).toBe("item-brake-service");
    expect(payload.sectionB[0].sub_rows).toHaveLength(2);
  });

  it("a Section A category line with no item cannot be saved — the named check is red, nothing is posted", async () => {
    emitLines = [sectionALine({ item_id: undefined })];
    renderCreate();
    fireEvent.click(screen.getByTestId("emit-lines"));
    await waitFor(() => expect(screen.getAllByText(/Item required on every cost line/).length).toBeGreaterThan(0));
    expect(screen.getByTestId("wo-create-btn")).toBeDisabled();
    fireEvent.click(screen.getByTestId("wo-create-btn"));
    expect(createWorkOrder).not.toHaveBeenCalled();
  });

  it("a Section B line with no item cannot be saved either", async () => {
    emitLines = [sectionBLine({ service_item_uuid: undefined })];
    renderCreate();
    fireEvent.click(screen.getByTestId("emit-lines"));
    await waitFor(() => expect(screen.getAllByText(/Item required on every cost line/).length).toBeGreaterThan(0));
    expect(screen.getByTestId("wo-create-btn")).toBeDisabled();
    expect(createWorkOrder).not.toHaveBeenCalled();
  });
});
