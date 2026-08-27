import type React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as mdataApi from "../../../api/mdata";
import * as safetyApi from "../../../api/safety";
import { MemoryRouter } from "react-router-dom";
import { DrugAlcoholTab } from "../tabs/DrugAlcoholTab";
import { pickCombo } from "../../../test-utils/pickCombo";
import { ToastProvider } from "../../../components/Toast";

/**
 * SAF-B24-residual: the "Selected:" driver preview must show the resolved driver name, not the raw uuid.
 * pickCombo drives the EntityPicker combobox (fireEvent-based — avoids userEvent.setup() break).
 */

const companyId = "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071";

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: companyId }),
}));

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <ToastProvider>{ui}</ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe("DrugAlcoholTab selected-driver label (SAF-B24-residual)", () => {
  beforeEach(() => {
    // DrugAlcoholDashboard / RandomTestingPool / ReturnToDuty all call a raw fetch() wrapper
    // (apiGet) rather than an exported api function — stub global fetch so those subcomponents
    // resolve harmlessly instead of throwing.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ enrollments: [], tests: [], draws: [], pool: [], rtd: [] }),
      })
    );
    // EntityPicker roster uses listDrivers; Selected: preview uses useDriverLabels → getDriverLabels.
    vi.spyOn(mdataApi, "getDriverLabels").mockResolvedValue({
      labels: [{ id: "driver-1", label: "Jordan Ruiz" }],
    });
    vi.spyOn(mdataApi, "listDrivers").mockResolvedValue({
      total: 1,
      drivers: [{ id: "driver-1", first_name: "Jordan", last_name: "Ruiz", status: "Active" } as never],
    });
    vi.spyOn(safetyApi, "listDrugProgramTests").mockResolvedValue({ tests: [], total_count: 0 });
    vi.spyOn(safetyApi, "listRandomPoolEntries").mockResolvedValue({ entries: [], total_count: 0 });
    vi.spyOn(safetyApi, "listClearinghouseQueries").mockResolvedValue({ queries: [], total_count: 0 });
    vi.spyOn(safetyApi, "getDriverDrugProgramStatus").mockResolvedValue({ is_blocked: false, block_reason: null } as never);
    vi.spyOn(safetyApi, "getDriverRtdCase").mockResolvedValue(null as never);
    vi.spyOn(safetyApi, "getDriverDispatchEligibility").mockResolvedValue({ eligible: true } as never);
  });

  it("shows the driver's resolved name in the 'Selected:' preview, not the raw uuid", async () => {
    render(wrap(<DrugAlcoholTab />));
    const driverPicker = await screen.findByPlaceholderText("All drivers");
    // EntityPicker's roster is a server-search query — open the listbox, then wait for it to
    // resolve before picking (pickCombo's own open+pick is synchronous and would race the fetch).
    fireEvent.focus(driverPicker);
    fireEvent.click(driverPicker);
    await screen.findByRole("option", { name: /Jordan Ruiz/ });
    pickCombo(driverPicker, /Jordan Ruiz/);
    // Labels resolve async via useDriverLabels → getDriverLabels; wait for map populate.
    await waitFor(() => expect(mdataApi.getDriverLabels).toHaveBeenCalled());
    const preview = await screen.findByText(/^Selected:/);
    await waitFor(() => {
      expect(preview.parentElement?.textContent).toContain("Jordan Ruiz");
    });
    expect(preview.parentElement?.textContent).not.toContain("driver-1");
  });
});
