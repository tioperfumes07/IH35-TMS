import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as dispatchApi from "../../api/dispatch";
import { DispatchPage } from "../Dispatch";

vi.mock("../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({
    companies: [{ id: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071", legal_name: "IH35", short_name: "IH35" }],
    selectedCompanyId: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071",
  }),
}));

vi.mock("../../components/Toast", () => ({
  useToast: () => ({ pushToast: vi.fn() }),
}));

vi.mock("../../api/loads", () => ({
  useLoadsList: () => ({ data: { loads: [], total_count: 0 }, isLoading: false, error: null, refetch: vi.fn() }),
  useUpdateLoadStatus: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("../../api/mdata", () => ({
  listCustomers: vi.fn(async () => ({ customers: [] })),
  listDrivers: vi.fn(async () => ({ drivers: [] })),
}));

vi.mock("../../api/dispatch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/dispatch")>();
  return {
    ...actual,
    getDispatchDashboard: vi.fn(async () => ({
      active_loads: 0,
      in_transit: 0,
      delivered: 0,
    })),
    listDispatchAssignmentHistory: vi.fn(async () => ({
      rows: [
        {
          id: "h1",
          load_id: "l1",
          assignment_method: "quicksave",
          reason_code: "driver_swap",
          notes: null,
          assigned_at: "2026-06-02T10:00:00Z",
          load_number: "LD-442",
          previous_driver_name: "Bob Old",
          new_driver_name: "Jane Driver",
          previous_unit_number: "100",
          new_unit_number: "101",
        },
      ],
    })),
  };
});

vi.mock("../../api/driverFinance", () => ({
  listSettlements: vi.fn(async () => ({ settlements: [], total_count: 0 })),
}));

vi.mock("../../api/safetyGeofence", () => ({
  listGeofenceBreaches: vi.fn(async () => ({ events: [] })),
}));

vi.mock("../../api/telematics", () => ({
  listLatestPositions: vi.fn(async () => ({ rows: [] })),
}));

vi.mock("../../api/telematicsApi", () => ({
  getTelematicsHeatmap: vi.fn(async () => ({ rows: [] })),
}));

vi.mock("../../components/dispatch/DispatchSubnav", () => ({
  DispatchSubnav: () => null,
}));

vi.mock("../dispatch/DispatchOverview", () => ({
  DispatchOverview: () => <div data-testid="dispatch-overview-stub" />,
}));

vi.mock("../../components/dispatch/DispatchKanban", () => ({
  DispatchKanban: () => <div data-testid="dispatch-kanban-stub" />,
}));

vi.mock("../dispatch/DispatchBoard", () => ({
  DispatchBoard: () => <div data-testid="dispatch-board-stub" />,
}));

vi.mock("../../components/dispatch/LoadDetailDrawer", () => ({
  LoadDetailDrawer: () => null,
}));

vi.mock("../dispatch/components/BookLoadModal", () => ({
  BookLoadModal: () => null,
}));

vi.mock("../../components/border-crossing/CbpWaitTimesWidget", () => ({
  CbpWaitTimesWidget: () => null,
}));

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/dispatch"]}>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("DispatchPage secondary nav (B21-D12)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders five dispatch secondary tabs", async () => {
    wrap(<DispatchPage />);
    expect(await screen.findByTestId("dispatch-secondary-nav")).toBeTruthy();
    for (const label of ["Load board", "Book load", "Assignments", "Settlements", "Pre-settlements"]) {
      expect(screen.getByRole("button", { name: label })).toBeTruthy();
    }
  });

  it("embeds D2 assignment history when Assignments tab is selected", async () => {
    const user = userEvent.setup();
    wrap(<DispatchPage />);
    await user.click(screen.getByRole("button", { name: "Assignments" }));
    expect(await screen.findByTestId("dispatch-assignments-embed")).toBeTruthy();
    expect(await screen.findByTestId("dispatch-assignment-history-page")).toBeTruthy();
    expect(await screen.findByText("Jane Driver")).toBeTruthy();
    expect(dispatchApi.listDispatchAssignmentHistory).toHaveBeenCalled();
  });

  it("links settlements tab to canonical driver finance route", async () => {
    const user = userEvent.setup();
    wrap(<DispatchPage />);
    await user.click(screen.getByRole("button", { name: "Settlements" }));
    const link = await screen.findByTestId("dispatch-settlements-link");
    expect(link.getAttribute("href")).toBe("/driver-finance/settlements");
    expect(screen.getByTestId("dispatch-settlements-quicklink")).toBeTruthy();
  });

  it("surfaces the existing dispatch planners from the header (V3)", async () => {
    const user = userEvent.setup();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/dispatch"]}>
          <Routes>
            <Route path="/dispatch" element={<DispatchPage />} />
            <Route path="/dispatch/planners/driver" element={<div data-testid="planners-driver-route" />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await user.click(await screen.findByTestId("dispatch-open-planners"));
    expect(await screen.findByTestId("planners-driver-route")).toBeTruthy();
  });
});
