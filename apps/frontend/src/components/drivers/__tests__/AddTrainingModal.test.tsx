// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as clientApi from "../../../api/client";
import * as safetyApi from "../../../api/safety";
import { AddTrainingModal } from "../AddTrainingModal";

const companyId = "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071";
const driverId = "d1111111-1111-4111-8111-111111111111";

function wrap(ui: Parameters<typeof render>[0]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("AddTrainingModal (A24-7)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(safetyApi, "getTrainingCompletions").mockResolvedValue({
      training_completions: [{ training_name: "Defensive Driving", driver_id: driverId }],
    } as never);
    vi.spyOn(clientApi, "apiRequest").mockResolvedValue({ id: "tr-1", training_name: "Defensive Driving" } as never);
  });

  it("renders program select, completion date, and notes when open", async () => {
    wrap(
      <AddTrainingModal
        open
        driverId={driverId}
        companyId={companyId}
        driverName="Jane Driver"
        onClose={() => undefined}
      />
    );
    expect(await screen.findByTestId("add-training-modal")).toBeInTheDocument();
    expect(screen.getByTestId("add-training-program")).toBeInTheDocument();
    expect(screen.getByTestId("add-training-completed")).toBeInTheDocument();
    expect(screen.getByTestId("add-training-notes")).toBeInTheDocument();
  });

  it("POSTs per-driver training and calls onCreated on success", async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn();
    const onClose = vi.fn();
    wrap(
      <AddTrainingModal
        open
        driverId={driverId}
        companyId={companyId}
        driverName="Jane Driver"
        onClose={onClose}
        onCreated={onCreated}
      />
    );
    await screen.findByTestId("add-training-program");
    await waitFor(() => {
      expect(screen.getByRole("option", { name: "Defensive Driving" })).toBeInTheDocument();
    });
    await user.selectOptions(screen.getByTestId("add-training-program"), "Defensive Driving");
    fireEvent.change(screen.getByTestId("add-training-completed"), { target: { value: "2026-06-01" } });
    await user.type(screen.getByTestId("add-training-notes"), "Completed onsite");
    await user.click(screen.getByTestId("add-training-submit"));

    await waitFor(() => {
      expect(clientApi.apiRequest).toHaveBeenCalledWith(
        `/api/v1/mdata/drivers/${driverId}/training?operating_company_id=${encodeURIComponent(companyId)}`,
        expect.objectContaining({
          method: "POST",
          body: expect.objectContaining({
            training_name: "Defensive Driving",
            notes: "Completed onsite",
          }),
        })
      );
    });
    await waitFor(() => {
      expect(onCreated).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("shows an error when the create request fails", async () => {
    const user = userEvent.setup();
    vi.spyOn(clientApi, "apiRequest").mockRejectedValue(new Error("network"));
    wrap(
      <AddTrainingModal
        open
        driverId={driverId}
        companyId={companyId}
        driverName="Jane Driver"
        onClose={() => undefined}
      />
    );
    await screen.findByTestId("add-training-program");
    await waitFor(() => {
      expect(screen.getByRole("option", { name: "Defensive Driving" })).toBeInTheDocument();
    });
    await user.selectOptions(screen.getByTestId("add-training-program"), "Defensive Driving");
    await user.click(screen.getByTestId("add-training-submit"));
    expect(await screen.findByText("Failed to create training record.")).toBeInTheDocument();
  });
});
