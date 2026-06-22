import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DispatchPage } from "../Dispatch";

// E2E render lock for #1332 (GUARD's explicit ask): loading /dispatch/loads?view=kanban must put the REAL
// Kanban board in the DOM — NOT the List board — and must NOT redirect ?view back to list. Unlike
// DispatchKanbanView.test.tsx (which stubs DispatchKanban), this renders the real DispatchKanban component so
// the assertion proves the actual board mounts, exactly what GUARD re-tests live.

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

// DispatchKanban is rendered REAL (no mock) — that's the whole point of this E2E lock.
// DispatchBoard (the List view) is stubbed only so its presence/absence is a clean signal.
vi.mock("../dispatch/DispatchBoard", () => ({
  DispatchBoard: () => <div data-testid="dispatch-board" />,
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

describe("Dispatch /dispatch/loads?view=kanban — real Kanban board renders (#1332 E2E lock)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("puts the real Kanban board in the DOM and NOT the List board", async () => {
    wrap(<DispatchPage loadsDeepLink />, "/dispatch/loads?view=kanban");
    // The real DispatchKanban root testid — proves the actual board mounted, not a redirect-to-list.
    expect(await screen.findByTestId("dispatch-kanban-board")).toBeTruthy();
    expect(screen.queryByTestId("dispatch-board")).toBeNull();
  });

  it("does not redirect ?view=kanban back to the List board after mount", async () => {
    wrap(<DispatchPage loadsDeepLink />, "/dispatch/loads?view=kanban");
    await waitFor(() => expect(screen.getByTestId("dispatch-kanban-board")).toBeTruthy());
    // Give the loadsRoute reset-effect a chance to (wrongly) swap to List — it must not.
    expect(screen.queryByTestId("dispatch-board")).toBeNull();
  });
});
