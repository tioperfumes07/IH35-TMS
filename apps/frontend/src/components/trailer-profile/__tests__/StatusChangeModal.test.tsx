import type { ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import * as fleetApi from "../../../api/fleet-trailers";
import { StatusChangeModal } from "../StatusChangeModal";

function renderModal(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("StatusChangeModal", () => {
  beforeEach(() => {
    vi.spyOn(fleetApi, "putTrailerStatus").mockResolvedValue({ id: "eq-1" });
  });

  it("renders status change form fields", () => {
    renderModal(
      <StatusChangeModal
        open
        trailerId="eq-1"
        companyId="91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071"
        currentStatus="InService"
        onClose={() => undefined}
      />
    );
    expect(screen.getByTestId("tp-status-change-modal")).toBeTruthy();
    expect(screen.getByText(/New status/i)).toBeTruthy();
    expect(screen.getByText(/^Reason \*$/)).toBeTruthy();
  });

  it("submits PUT fleet trailer status with reason", async () => {
    const user = userEvent.setup();
    renderModal(
      <StatusChangeModal
        open
        trailerId="eq-1"
        companyId="91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071"
        currentStatus="InService"
        onClose={() => undefined}
        onSaved={() => undefined}
      />
    );
    await user.selectOptions(screen.getByLabelText(/new status/i), "InMaintenance");
    const reasonBox = screen.getAllByRole("textbox")[0];
    await user.type(reasonBox, "Scheduled shop");
    await user.click(screen.getByRole("button", { name: /confirm/i }));
    expect(fleetApi.putTrailerStatus).toHaveBeenCalledWith(
      "eq-1",
      "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071",
      expect.objectContaining({ status: "InMaintenance", reason: "Scheduled shop" })
    );
  });
});
