import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  at_fault: "disputed",
  preventable: true,
};

function wrap(ui: ReactElement, initialEntries: string[] = ["/"]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <ToastProvider>
        {/* EntityLink renders a react-router <Link>, so the harness needs a Router.
            Without it every test in this file died on useLocation() before asserting anything. */}
        <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}

describe("AccidentsPage", () => {
  beforeEach(() => {
    vi.spyOn(safetyApi, "getSafetyAccidents").mockResolvedValue({ accidents: [accidentFixture], total_count: 1 });
    vi.spyOn(safetyApi, "getSafetyAccidentDetail").mockResolvedValue(accidentFixture);
    vi.spyOn(safetyApi, "addAccidentPhoto").mockResolvedValue({ accident_id: "acc-1" } as never);
  });

  it("opens an exact accident reverse link even when the capped list omits it", async () => {
    vi.spyOn(safetyApi, "getSafetyAccidents").mockResolvedValue({ accidents: [], total_count: 0 });
    render(wrap(<AccidentsPage operatingCompanyId={companyId} />, ["/safety/accidents?accident_id=acc-1"]));
    expect(await screen.findByTestId("accident-report-drawer")).toBeTruthy();
    expect(safetyApi.getSafetyAccidentDetail).toHaveBeenCalledWith("acc-1", companyId);
  });

  it("renders live accident list from API", async () => {
    render(wrap(<AccidentsPage operatingCompanyId={companyId} />));
    expect(await screen.findByTestId("accidents-page")).toBeTruthy();
    expect(await screen.findByTestId("accident-row-acc-1")).toBeTruthy();
    expect(screen.getByText("I-35 MM 120")).toBeTruthy();
    // SAFE-1: fault + DOT preventability determinations render in the row (scope to the row so the
    // "Preventable" column header does not collide with the cell value).
    const row = within(await screen.findByTestId("accident-row-acc-1"));
    expect(row.getByText("Disputed")).toBeTruthy();
    expect(row.getByText("Preventable")).toBeTruthy();
    expect(safetyApi.getSafetyAccidents).toHaveBeenCalledWith(
      companyId,
      expect.objectContaining({}),
    );
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

  // C-02: reverse hop — no claim id → honest "—", never a fabricated link.
  it("shows honest — when an accident has no linked claim", async () => {
    render(wrap(<AccidentsPage operatingCompanyId={companyId} />));
    const row = await screen.findByTestId("accident-row-acc-1");
    expect(within(row).queryByTestId("accident-row-claim-acc-1")).toBeNull();
  });

  // C-02: joined claim renders EntityLink to /safety/insurance/claims?claim_id=…
  it("renders an EntityLink to the joined claim when claim_id is present", async () => {
    vi.spyOn(safetyApi, "getSafetyAccidents").mockResolvedValue({
      accidents: [{ ...accidentFixture, claim_id: "claim-1", claim_number: "CLM-0001" }],
      total_count: 1,
    } as never);
    render(wrap(<AccidentsPage operatingCompanyId={companyId} />));
    const link = await screen.findByTestId("accident-row-claim-acc-1");
    expect(link.getAttribute("href")).toBe("/safety/insurance/claims?claim_id=claim-1");
  });
});
