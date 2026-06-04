import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as maintenanceApi from "../../../api/maintenance";
import { ServiceTimeline } from "../ServiceTimeline";

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
    vi.spyOn(maintenanceApi, "getMaintenanceServiceTimeline").mockResolvedValue({ events: [sampleEvent], filters: {} });
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
    fireEvent.change(screen.getByTestId("service-timeline-from-date"), { target: { value: "2026-06-01" } });
    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ from_date: "2026-06-01", unit_id: "unit-1" })
      );
    });
  });
});
