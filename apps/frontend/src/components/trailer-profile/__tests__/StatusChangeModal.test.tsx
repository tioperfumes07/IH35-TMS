import type { ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import * as fleetApi from "../../../api/fleet-trailers";
import { StatusChangeModal } from "../StatusChangeModal";
import { pickCombo } from "../../../test-utils/pickCombo";

// The modal's reason picker reads the selected company (CompanyContext); give it one instead of throwing before paint.
vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "co-1" }),
}));
// With no reason catalog rows the reason step takes a typed reason, which only Owner/Accountant may type.
vi.mock("../../../auth/useAuth", () => ({ useAuth: () => ({ user: { role: "Owner" } }) }));
vi.mock("../../../api/catalogs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../api/catalogs")>()),
  listVoidCancelReasons: vi.fn(async () => ({ reasons: [] })),
}));

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
    // The reason is asked on Confirm, in the shared reason step — not as a field on this form.
    expect(screen.getByRole("button", { name: /confirm/i })).toBeTruthy();
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
    pickCombo(screen.getAllByRole("combobox")[0], "In Maintenance");
    await user.click(screen.getByRole("button", { name: /confirm/i }));
    await user.type(await screen.findByPlaceholderText(/Required reason/), "Scheduled shop");
    expect(screen.queryByText(/reversing entry/i)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Save status" }));
    await waitFor(() => expect(fleetApi.putTrailerStatus).toHaveBeenCalled());
    expect(fleetApi.putTrailerStatus).toHaveBeenCalledWith(
      "eq-1",
      "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071",
      expect.objectContaining({ status: "InMaintenance", reason: "Scheduled shop" })
    );
  });
});
