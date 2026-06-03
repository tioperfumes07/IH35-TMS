import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import * as mdataApi from "../../../api/mdata";
import { ActionBar } from "../ActionBar";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

function renderBar(status = "Active") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ActionBar
          driverId="d-1"
          companyId="c-1"
          driverName="Jane Driver"
          driverStatus={status}
          onActionComplete={vi.fn()}
        />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("ActionBar", () => {
  beforeEach(() => {
    navigateMock.mockReset();
    vi.spyOn(mdataApi, "sendDriverProfileMessage").mockResolvedValue({
      id: "m1",
      channel: "in_app",
      urgency: null,
      created_at: "2026-06-03T12:00:00Z",
    });
    vi.spyOn(mdataApi, "updateDriver").mockResolvedValue({ id: "d-1", status: "Inactive" } as never);
    vi.spyOn(mdataApi, "createSafetyEvent").mockResolvedValue({ event: { id: "e1" } } as never);
    vi.spyOn(mdataApi, "listTerminationReasons").mockResolvedValue({
      reasons: [{ id: "r1", code: "voluntary", label: "Voluntary", description: null, severity: "info", is_active: true, deactivated_at: null }],
    });
  });

  it("navigates to driver edit on Edit click", () => {
    renderBar();
    fireEvent.click(screen.getByTestId("dp-action-edit"));
    expect(navigateMock).toHaveBeenCalledWith("/drivers/d-1");
  });

  it("opens send message modal and submits", async () => {
    renderBar();
    fireEvent.click(screen.getByTestId("dp-action-send-message"));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Please call dispatch" } });
    fireEvent.click(screen.getByTestId("send-message-submit"));
    await waitFor(() => {
      expect(mdataApi.sendDriverProfileMessage).toHaveBeenCalledWith("d-1", "c-1", {
        message: "Please call dispatch",
        channel: "in_app",
        urgency: undefined,
      });
    });
  });

  it("renders view-on-map link with driver query", () => {
    renderBar();
    const link = screen.getByTestId("dp-action-view-map");
    expect(link.getAttribute("href")).toBe("/fleet/map?driver=d-1");
  });

  it("suspends driver via PATCH + safety event", async () => {
    renderBar();
    fireEvent.click(screen.getByTestId("dp-action-suspend"));
    fireEvent.change(screen.getByTestId("suspend-reason"), { target: { value: "Policy violation" } });
    fireEvent.click(screen.getByTestId("suspend-confirm"));
    await waitFor(() => {
      expect(mdataApi.updateDriver).toHaveBeenCalledWith("d-1", { status: "Inactive" });
      expect(mdataApi.createSafetyEvent).toHaveBeenCalled();
    });
  });

  it("terminates driver via safety event", async () => {
    renderBar();
    fireEvent.click(screen.getByTestId("dp-action-terminate"));
    await waitFor(() => expect(screen.getByTestId("terminate-summary")).toBeTruthy());
    fireEvent.change(screen.getByTestId("terminate-summary"), { target: { value: "End of contract" } });
    fireEvent.click(screen.getByTestId("terminate-confirm"));
    await waitFor(() => expect(mdataApi.createSafetyEvent).toHaveBeenCalled());
  });

  it("hides suspend/terminate when driver is terminated", () => {
    renderBar("Terminated");
    expect(screen.queryByTestId("dp-action-suspend")).toBeNull();
    expect(screen.queryByTestId("dp-action-terminate")).toBeNull();
  });
});
