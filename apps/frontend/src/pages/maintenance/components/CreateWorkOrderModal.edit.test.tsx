import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CreateWorkOrderModal, type EditWorkOrderTarget } from "./CreateWorkOrderModal";
import { ToastProvider } from "../../../components/Toast";
import { ApiError } from "../../../api/client";

// D2-3: real Work Order EDIT via the EXISTING endpoints — PATCH header + line-item POST/DELETE.
// This drives the edit modal end-to-end and asserts it calls the right existing endpoints, plus the
// posted-bill financial guard surfaces its clear "void the linked bill first" message.

const updateWorkOrder = vi.fn(() => Promise.resolve({ id: "wo-1" }));
const addWorkOrderLineItem = vi.fn(() => Promise.resolve({ id: "new-line" }));
const deleteWorkOrderLineItem = vi.fn(() => Promise.resolve());

vi.mock("../../../api/maintenance", () => ({
  createWorkOrder: vi.fn(() => Promise.resolve({ wo: { uuid: "wo-1" } })),
  suggestExpenseLoad: vi.fn(() => Promise.resolve({ data: null })),
  listMaintenanceVehicles: vi.fn(() => Promise.resolve({ rows: [] })),
  listMaintenanceDrivers: vi.fn(() => Promise.resolve({ rows: [] })),
  getWoCostContext: vi.fn(() => Promise.resolve({ data: {} })),
  updateWorkOrder: (...args: unknown[]) => updateWorkOrder(...(args as [])),
  addWorkOrderLineItem: (...args: unknown[]) => addWorkOrderLineItem(...(args as [])),
  deleteWorkOrderLineItem: (...args: unknown[]) => deleteWorkOrderLineItem(...(args as [])),
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
    selectedCompanyId: "91e0bf0a-133f-4ce8-a734-2586cfa66d96",
    selectedCompany: null,
    isLoading: false,
    setSelectedCompany: () => {},
    setDefaultCompanyForUser: () => Promise.resolve(),
  }),
}));

const COMPANY = "91e0bf0a-133f-4ce8-a734-2586cfa66d96";

const editTarget: EditWorkOrderTarget = {
  id: "wo-1",
  display_id: "WO-T139-IS-07-01-2026-0001-ABCDE",
  status: "open",
  description: "Original brake job",
  bucket: "external",
  wo_priority: "routine",
  line_items: [
    { id: "line-1", line_type: "parts", description: "Brake pads", quantity: 2, unit_cost: 40, amount: 80 },
  ],
};

function renderEdit(overrides?: Partial<EditWorkOrderTarget>, onCreated = () => {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <CreateWorkOrderModal
          open={true}
          operatingCompanyId={COMPANY}
          editWorkOrder={{ ...editTarget, ...overrides }}
          onClose={() => {}}
          onCreated={onCreated}
        />
      </ToastProvider>
    </QueryClientProvider>
  );
}

describe("CreateWorkOrderModal — edit mode", () => {
  beforeEach(() => {
    updateWorkOrder.mockClear();
    addWorkOrderLineItem.mockClear();
    deleteWorkOrderLineItem.mockClear();
  });

  it("renders as 'Edit Work Order' with header + cost lines prefilled from the WO", () => {
    renderEdit();
    expect(screen.getByText("Edit Work Order")).toBeInTheDocument();
    expect(screen.getByTestId("edit-wo-modal")).toBeInTheDocument();
    expect((screen.getByTestId("edit-wo-description") as HTMLInputElement).value).toBe("Original brake job");
    expect(screen.getByDisplayValue("Brake pads")).toBeInTheDocument();
  });

  it("edits the description → persists via the existing PATCH endpoint", async () => {
    renderEdit();
    fireEvent.change(screen.getByTestId("edit-wo-description"), { target: { value: "Brake job + rotor" } });
    fireEvent.click(screen.getByTestId("edit-wo-save-btn"));
    await waitFor(() => expect(updateWorkOrder).toHaveBeenCalledTimes(1));
    const [id, companyId, payload] = updateWorkOrder.mock.calls[0] as unknown as [string, string, { description?: string }];
    expect(id).toBe("wo-1");
    expect(companyId).toBe(COMPANY);
    expect(payload.description).toBe("Brake job + rotor");
    // No cost lines changed → no line-item calls.
    expect(addWorkOrderLineItem).not.toHaveBeenCalled();
    expect(deleteWorkOrderLineItem).not.toHaveBeenCalled();
  });

  it("adds a cost line → POSTs to the existing line-item endpoint (no posted bill)", async () => {
    renderEdit();
    fireEvent.click(screen.getByTestId("edit-wo-add-line"));
    const bodyRows = screen.getByTestId("edit-wo-lines-body").querySelectorAll("tr");
    // Fill the new row's description (last row).
    const lastRow = bodyRows[bodyRows.length - 1];
    const descInput = lastRow.querySelectorAll("input")[0] as HTMLInputElement;
    fireEvent.change(descInput, { target: { value: "Labor: 1.5h" } });
    fireEvent.click(screen.getByTestId("edit-wo-save-btn"));
    await waitFor(() => expect(addWorkOrderLineItem).toHaveBeenCalledTimes(1));
    const [id, companyId, payload] = addWorkOrderLineItem.mock.calls[0] as unknown as [
      string,
      string,
      { description: string }
    ];
    expect(id).toBe("wo-1");
    expect(companyId).toBe(COMPANY);
    expect(payload.description).toBe("Labor: 1.5h");
  });

  it("removes an existing cost line → DELETEs via the existing line-item endpoint", async () => {
    renderEdit();
    fireEvent.click(screen.getByTestId("edit-wo-remove-line-0"));
    fireEvent.click(screen.getByTestId("edit-wo-save-btn"));
    await waitFor(() => expect(deleteWorkOrderLineItem).toHaveBeenCalledTimes(1));
    const [id, lineId] = deleteWorkOrderLineItem.mock.calls[0] as unknown as [string, string];
    expect(id).toBe("wo-1");
    expect(lineId).toBe("line-1");
  });

  it("BLOCKS a cost edit when the WO has a posted bill (clear void-first message)", async () => {
    addWorkOrderLineItem.mockRejectedValueOnce(
      new ApiError(409, {
        error: "E_WO_POSTED_BILL_LOCK",
        message: "This work order already has a posted bill in Accounts Payable. Void the linked bill first, then edit its cost lines.",
      })
    );
    renderEdit();
    fireEvent.click(screen.getByTestId("edit-wo-add-line"));
    fireEvent.click(screen.getByTestId("edit-wo-save-btn"));
    await waitFor(() => expect(screen.getByTestId("edit-wo-posted-lock")).toBeInTheDocument());
    expect(screen.getByTestId("edit-wo-posted-lock").textContent).toMatch(/Void the linked bill first/i);
  });
});
