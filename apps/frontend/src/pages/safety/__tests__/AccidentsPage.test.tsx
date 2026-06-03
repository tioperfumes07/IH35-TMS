import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as safetyApi from "../../../api/safety";
import { ToastProvider } from "../../../components/Toast";
import { AccidentsPage } from "../AccidentsPage";

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071" }),
}));

const companyId = "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071";

const accidentFixture = {
  id: "acc-1",
  accident_at: "2026-06-01T12:00:00Z",
  driver_id: "driver-1",
  unit_id: "unit-1",
  location: "I-35 MM 120",
  status: "open",
  notes: "Rear-end contact",
};

function wrap(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>
  );
}

describe("AccidentsPage", () => {
  beforeEach(() => {
    vi.spyOn(safetyApi, "getSafetyAccidents").mockResolvedValue({ accidents: [accidentFixture] });
    vi.spyOn(safetyApi, "addAccidentPhoto").mockResolvedValue({ accident_id: "acc-1" } as never);
  });

  it("renders live accident list from API", async () => {
    render(wrap(<AccidentsPage operatingCompanyId={companyId} />));
    expect(await screen.findByTestId("accidents-page")).toBeTruthy();
    expect(await screen.findByTestId("accident-row-acc-1")).toBeTruthy();
    expect(screen.getByText("I-35 MM 120")).toBeTruthy();
    expect(safetyApi.getSafetyAccidents).toHaveBeenCalledWith(companyId);
  });

  it("opens AccidentReportDrawer from + Create Accident", async () => {
    const user = userEvent.setup();
    render(wrap(<AccidentsPage operatingCompanyId={companyId} />));
    await screen.findByTestId("accidents-table");
    await user.click(screen.getByTestId("accidents-create-btn"));
    expect(await screen.findByTestId("accident-report-drawer")).toBeTruthy();
    expect(screen.getByText("Create Accident Report")).toBeTruthy();
  });

  it("uploads photo for an existing accident via drawer", async () => {
    render(wrap(<AccidentsPage operatingCompanyId={companyId} />));
    fireEvent.click(await screen.findByRole("button", { name: "Open accident" }));
    const input = await screen.findByTestId("accident-photo-input");
    const file = new File(["photo"], "scene.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => {
      expect(safetyApi.addAccidentPhoto).toHaveBeenCalledWith("acc-1", companyId, file);
    });
  });
});
