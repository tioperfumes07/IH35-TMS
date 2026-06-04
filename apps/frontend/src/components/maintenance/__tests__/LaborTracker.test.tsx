import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LaborTracker } from "../LaborTracker";

vi.mock("../../../auth/useAuth", () => ({ useAuth: () => ({ user: { role: "Owner" } }) }));
vi.mock("../../Toast", () => ({ useToast: () => ({ pushToast: vi.fn() }) }));

const listMaintenanceLaborCodes = vi.fn(async () => ({
  labor_codes: [{ id: "code-1", code: "PM-SERVICE", display_name: "PM service", description: null, rate_cents_per_hour: 5500, metadata: {}, is_active: true, sort_order: 10 }],
}));
const listWoTimeEntries = vi.fn(async () => ({
  time_entries: [{ id: "entry-open", actor_kind: "internal_mechanic", started_at: new Date(Date.now() - 90_000).toISOString(), ended_at: null, labor_rate_cents_per_hour: 6000, labor_code: { code: "PM-SERVICE" } }],
}));

vi.mock("../../../api/maintenance", () => ({ listMaintenanceLaborCodes: () => listMaintenanceLaborCodes() }));
vi.mock("../../../api/woTimeEntries", () => ({
  listWoTimeEntries: () => listWoTimeEntries(),
  startWoTimeEntry: vi.fn(), stopWoTimeEntry: vi.fn(), createWoTimeEntryManual: vi.fn(), patchWoTimeEntry: vi.fn(), deleteWoTimeEntry: vi.fn(),
}));

function renderTracker() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><LaborTracker workOrderId="wo-1" operatingCompanyId="co-1" /></QueryClientProvider>);
}

describe("LaborTracker (B34)", () => {
  beforeEach(() => { listMaintenanceLaborCodes.mockClear(); listWoTimeEntries.mockClear(); });
  it("renders mechanic labor tracker shell", async () => { renderTracker(); expect(await screen.findByTestId("maint-labor-tracker")).toBeTruthy(); expect(screen.getByRole("button", { name: /Clock in/i })).toBeTruthy(); });
  it("shows running timer for open entry", async () => { renderTracker(); expect(await screen.findByTestId("maint-labor-running-timer")).toBeTruthy(); });
  it("lists labor codes and entry rows", async () => { renderTracker(); await waitFor(() => expect(listMaintenanceLaborCodes).toHaveBeenCalled()); expect(await screen.findByTestId("maint-labor-entries-table")).toBeTruthy(); });
});
