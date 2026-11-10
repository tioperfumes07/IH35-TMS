import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AvailableTrucksPage } from "./AvailableTrucksPage";
import type { CapacityResponse } from "../../api/dispatch-capacity";

// CAPACITY ENGINE (spec 11-10): the screen shows each truck's place/time/source, unknowns as "—" + reason, the switch
// state (created OFF), the audience count, and each load board's "Not connected — needs <board> API credentials".
const { CAPACITY } = vi.hoisted(() => {
  const capacity: CapacityResponse = {
    rows: [
      {
        unit_id: "u-152", unit_number: "T152", driver_name: "Juan Perez", equipment: "Reefer", equipment_source: "last_load",
        available_city: "Laredo", available_state: "TX", available_at: "2026-11-10T22:20:00Z", source: "gps", reason: null,
        last_load_id: null, last_load_number: null, open_load_count: 0, offer_enabled: true, off_reason_code: null, offerable: true,
      },
      {
        unit_id: "u-170", unit_number: "T170", driver_name: null, equipment: "Reefer", equipment_source: "next_load",
        available_city: "Medley", available_state: "FL", available_at: "2026-11-10T06:00:00Z", source: "scheduled", reason: null,
        last_load_id: "l-13735", last_load_number: "13735", open_load_count: 1, offer_enabled: true, off_reason_code: null, offerable: true,
      },
      {
        unit_id: "u-122", unit_number: "T122", driver_name: null, equipment: "Reefer", equipment_source: "last_load",
        available_city: "Laredo", available_state: "TX", available_at: "2026-09-26T12:00:00Z", source: "gps",
        reason: "last GPS position is 45 days old",
        last_load_id: null, last_load_number: null, open_load_count: 0, offer_enabled: true, off_reason_code: null, offerable: false,
      },
    ],
    settings: { send_truck_offers: false, reply_to_email: null },
    recipient_count: 0,
    boards: [
      { board: "dat", connected: false, reason: "Not connected — needs DAT API credentials (DAT_API_CLIENT_ID)" },
      { board: "truckstop", connected: false, reason: "Not connected — needs Truckstop API credentials (TRUCKSTOP_API_USERNAME)" },
    ],
    generated_at: "2026-11-10T23:00:00Z",
  };
  return { CAPACITY: capacity };
});

vi.mock("../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "5c854333-6ea5-4faa-af31-67cb272fef80" }),
}));
vi.mock("../../auth/useAuth", () => ({
  useAuth: () => ({ user: { role: "Dispatcher" }, isLoading: false, isUnauthenticated: false, refetch: vi.fn() }),
}));
vi.mock("../../api/dispatch-capacity", () => ({
  getCapacity: vi.fn().mockResolvedValue(CAPACITY),
  getCapacityPreview: vi.fn(),
  setUnitOffer: vi.fn(),
  updateCapacitySettings: vi.fn(),
}));
vi.mock("../../components/override/OverrideButton", () => ({
  OverrideButton: ({ testId }: { testId?: string }) => <button type="button" data-testid={testId}>Turn off</button>,
}));

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <AvailableTrucksPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("AvailableTrucksPage — capacity engine screen", () => {
  it("renders each truck's place, source, reason and offer control", async () => {
    renderPage();
    expect(await screen.findByTestId("capacity-unit-T152")).toBeTruthy();
    const page = screen.getByTestId("dispatch-available-trucks-page");
    expect(within(page).getAllByText("Laredo, TX").length).toBeGreaterThan(0);
    expect(within(page).getByText("Medley, FL")).toBeTruthy();
    expect(within(page).getAllByText("GPS (no open load)").length).toBeGreaterThan(0);
    expect(screen.getByTestId("capacity-reason-T122").textContent).toMatch(/45 days old/);
    expect(screen.getByTestId("capacity-offer-off-T152")).toBeTruthy();
  });

  it("shows the switch OFF, the audience and the not-connected boards; a non-owner has no switch toggle", async () => {
    renderPage();
    expect(await screen.findByText(/Off — no email is sent/)).toBeTruthy();
    expect(screen.getByTestId("capacity-switch-state").textContent).toMatch(/Off — no email is sent/);
    expect(screen.queryByTestId("capacity-switch-toggle")).toBeNull();
    expect(screen.getByTestId("capacity-recipient-count").textContent).toMatch(/0 contacts flagged/);
    expect(screen.getByTestId("capacity-board-dat").textContent).toMatch(/Not connected — needs DAT API credentials/);
    expect(screen.getByTestId("capacity-board-truckstop").textContent).toMatch(/Not connected — needs Truckstop API credentials/);
  });
});
