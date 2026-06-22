import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DispatchPage } from "../Dispatch";

// Regression lock for #1332 — the dead Kanban view. /dispatch/loads previously force-returned the List
// board (parseViewMode hard-defaulted to "list" on the loads route, and an effect reset ?view back to
// "list" on every render), so the Kanban (and Units) view tab was a no-op. These tests prove an explicit
// ?view=kanban / ?view=units actually mounts that board and is NOT overwritten back to List.

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
    getDispatchDashboard: vi.fn(async () => ({ active_loads: 0, in_transit: 0, delivered: 0 })),
    listUnitsWithoutLoad: vi.fn(async () => ({ units: [] })),
    listDispatchAssignmentHistory: vi.fn(async () => ({ rows: [] })),
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

vi.mock("../../components/dispatch/FleetOosStrip", () => ({
  FleetOosStrip: () => null,
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

vi.mock("../dispatch/RoundTrips", () => ({
  RoundTrips: () => <div data-testid="dispatch-roundtrips-stub" />,
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

function wrap(ui: ReactNode, entry: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[entry]}>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Dispatch loads route — board view selection (#1332 dead-Kanban lock)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the Kanban board (not List) when ?view=kanban on /dispatch/loads", async () => {
    wrap(<DispatchPage loadsDeepLink />, "/dispatch/loads?view=kanban");
    expect(await screen.findByTestId("dispatch-kanban-stub")).toBeTruthy();
    // The bug rendered the List board instead — assert it is NOT shown.
    expect(screen.queryByTestId("dispatch-board-stub")).toBeNull();
  });

  it("does NOT overwrite ?view=kanban back to list (the reset-effect regression)", async () => {
    wrap(<DispatchPage loadsDeepLink />, "/dispatch/loads?view=kanban");
    // Give the loadsRoute effect a chance to (wrongly) reset the view; Kanban must survive.
    await waitFor(() => expect(screen.getByTestId("dispatch-kanban-stub")).toBeTruthy());
    expect(screen.queryByTestId("dispatch-board-stub")).toBeNull();
  });

  it("renders the Units board when ?view=units on /dispatch/loads", async () => {
    wrap(<DispatchPage loadsDeepLink />, "/dispatch/loads?view=units");
    expect(await screen.findByTestId("dispatch-roundtrips-stub")).toBeTruthy();
    expect(screen.queryByTestId("dispatch-board-stub")).toBeNull();
  });

  it("defaults to the List board when no ?view is set on /dispatch/loads", async () => {
    wrap(<DispatchPage loadsDeepLink />, "/dispatch/loads");
    expect(await screen.findByTestId("dispatch-board-stub")).toBeTruthy();
    expect(screen.queryByTestId("dispatch-kanban-stub")).toBeNull();
  });
});
