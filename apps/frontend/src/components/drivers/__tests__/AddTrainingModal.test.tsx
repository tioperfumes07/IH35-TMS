// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
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

  it("renders program select, completion date, expiry date, and notes when open", async () => {
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
    expect(screen.getByTestId("add-training-expiry")).toBeInTheDocument();
    expect(screen.getByTestId("add-training-notes")).toBeInTheDocument();
  });

  it("POSTs per-driver training with expiry and calls onCreated on success", async () => {
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
    const programPicker = within(await screen.findByTestId("add-training-program")).getByRole("combobox");
    await user.click(programPicker);
    await user.click(await screen.findByRole("option", { name: "Defensive Driving" }));
    // Completion date is the shared DatePicker (SYS-DATE) — open it and pick a day in the
    // currently-displayed month rather than fireEvent.change (it's a button, not a native input).
    // The POST body assertion below doesn't depend on the exact date picked.
    await user.click(within(screen.getByTestId("add-training-completed")).getByRole("button"));
    await user.click(await screen.findByRole("button", { name: "1" }));
    await user.click(within(screen.getByTestId("add-training-expiry")).getByRole("button"));
    await user.click(await screen.findByRole("button", { name: "15" }));
    await user.type(screen.getByTestId("add-training-notes"), "Completed onsite");
    await user.click(screen.getByTestId("add-training-submit"));

    await waitFor(() => {
      expect(clientApi.apiRequest).toHaveBeenCalledWith(
        `/api/v1/mdata/drivers/${driverId}/training?operating_company_id=${encodeURIComponent(companyId)}`,
        expect.objectContaining({
          method: "POST",
          body: expect.objectContaining({
            training_name: "Defensive Driving",
            expiry_date: expect.stringMatching(/^\d{4}-\d{2}-15$/),
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
    const programPicker = within(await screen.findByTestId("add-training-program")).getByRole("combobox");
    await user.click(programPicker);
    await user.click(await screen.findByRole("option", { name: "Defensive Driving" }));
    await user.click(screen.getByTestId("add-training-submit"));
    expect(await screen.findByText("network")).toBeInTheDocument();
  });
});
