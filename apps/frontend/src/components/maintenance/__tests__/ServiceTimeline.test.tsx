import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as maintenanceApi from "../../../api/maintenance";
import { ServiceTimeline } from "../ServiceTimeline";
import { pickDate } from "../../../test-utils/pickDate";

const navigate = vi.fn();

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useNavigate: () => navigate,
  };
});

const sampleEvent = {
  id: "wo-1",
  event_type: "work_order" as const,
  occurred_at: "2026-06-03T08:00:00.000Z",
  title: "WO WO-100",
  subtitle: "Brake pad replacement",
  status: "open",
  detail_path: "/maintenance/work-orders/wo-1",
};

function renderTimeline(props: Partial<React.ComponentProps<typeof ServiceTimeline>> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ServiceTimeline
          companyId="91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071"
          unitId="unit-1"
          {...props}
        />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("ServiceTimeline (B31)", () => {
  beforeEach(() => {
    navigate.mockReset();
    vi.spyOn(maintenanceApi, "getMaintenanceServiceTimeline").mockResolvedValue({
      events: [sampleEvent], total_count: 1, limit: 50, offset: 0, filters: {},
    });
  });

  it("renders service history timeline shell", async () => {
    renderTimeline();
    expect(await screen.findByTestId("service-timeline")).toBeInTheDocument();
    expect(await screen.findByTestId("service-timeline-event-work_order-wo-1")).toBeInTheDocument();
  });

  it("navigates to canonical detail on event click", async () => {
    renderTimeline();
    fireEvent.click(await screen.findByTestId("service-timeline-event-work_order-wo-1"));
    expect(navigate).toHaveBeenCalledWith("/maintenance/work-orders/wo-1");
  });

  it("refetches when date filters change", async () => {
    const spy = vi.spyOn(maintenanceApi, "getMaintenanceServiceTimeline");
    renderTimeline();
    await screen.findByTestId("service-timeline");
    // The from-date is the shared DatePicker (button + calendar popover), not a typeable input — the old
    // fireEvent.change threw "The given element does not have a value setter", so this test never actually
    // exercised the refetch it is named for. Drive the real control instead (FE-TESTS-TYPE-INTO-DATEPICKER).
    pickDate(screen.getByTestId("service-timeline-from-date"));
    // The picker yields the day it clicked in the month it opens on, which is "today"-relative and therefore
    // NOT a fixed literal. Asserting the old hardcoded "2026-06-01" would be asserting a date this control
    // can no longer produce. What the test is actually named for — "refetches when date filters change" — is
    // that a real ISO from_date reached the API alongside the unit, so that is what is asserted.
    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ from_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), unit_id: "unit-1" })
      );
    });
  });

  it("requests the next exact server range", async () => {
    const spy = vi.spyOn(maintenanceApi, "getMaintenanceServiceTimeline").mockResolvedValue({
      events: [sampleEvent], total_count: 75, limit: 50, offset: 0, filters: {},
    });
    renderTimeline();
    fireEvent.click(await screen.findByRole("button", { name: "Next" }));
    await waitFor(() => expect(spy).toHaveBeenCalledWith(expect.objectContaining({ limit: 50, offset: 50 })));
  });
});
