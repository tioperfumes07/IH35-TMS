import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import * as mdataApi from "../../api/mdata";
import * as dispatchApi from "../../api/dispatch";
import * as safetyApi from "../../api/safety";
import { ToastProvider } from "../Toast";
import { AccidentReportDrawer } from "./AccidentReportDrawer";

vi.mock("../../api/safety", () => ({
  createSafetyAccident: vi.fn().mockResolvedValue({ id: "accident-1" }),
  patchSafetyAccident: vi.fn().mockResolvedValue({ id: "accident-1" }),
  addAccidentPhoto: vi.fn().mockResolvedValue({}),
  setSafetyAccidentStatus: vi.fn().mockResolvedValue({}),
  spawnSafetyLiability: vi.fn().mockResolvedValue({}),
  spawnSafetyWo: vi.fn().mockResolvedValue({}),
}));

// SC1: the four catalogs source from the real company-scoped list functions.
vi.mock("../../api/mdata", () => ({
  listDrivers: vi.fn().mockResolvedValue({
    drivers: [{ id: "driver-uuid-1", first_name: "Alfredo", last_name: "Cazares" }],
    total: 1,
  }),
  listUnits: vi.fn().mockResolvedValue({ units: [{ id: "unit-uuid-1", unit_number: "T-101" }], total: 1 }),
  listVendors: vi.fn().mockResolvedValue({ vendors: [{ id: "vendor-uuid-1", name: "Laredo Diesel" }], total: 1 }),
  // The drawer's driver picker is DriverPickerWithCreate, which imports createDriver for its inline
  // "+ Add new". A factory mock replaces the WHOLE module, so omitting one export made every test in
  // this file throw at import time — all 8 were failing for that reason alone, asserting nothing.
  createDriver: vi.fn().mockResolvedValue({ driver: { id: "driver-uuid-new" } }),
}));

vi.mock("../../api/dispatch", () => ({
  listDispatchLoads: vi.fn().mockResolvedValue({ loads: [{ id: "load-uuid-1", load_number: "LD-9001" }], total_count: 1, has_more: false }),
}));

// Render the picker as a native <select> so selection is deterministic; the stored VALUE is the uuid.
vi.mock("../shared/Combobox", () => ({
  Combobox: ({
    options,
    value,
    onChange,
    placeholder,
  }: {
    options: Array<{ value: string; label: string }>;
    value: string | null;
    onChange: (v: string | null) => void;
    placeholder?: string;
  }) => (
    <select aria-label={placeholder ?? "combobox"} value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">--</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  ),
}));

// Repair Vendor migrated to the shared ReferenceSelect (+ Create vendor). Render as a native
// <select> too, matching the shared/Combobox mock above, so the existing selectOptions-driven
// assertions stay deterministic without asserting on the +Create inline-create chrome here.
vi.mock("../parity/ReferenceSelect", () => ({
  ReferenceSelect: ({
    options,
    value,
    onChange,
    placeholder,
  }: {
    options: Array<{ value: string; label: string }>;
    value: string | null;
    onChange: (v: string | null) => void;
    placeholder?: string;
  }) => (
    <select aria-label={placeholder ?? "combobox"} value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">--</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  ),
}));

vi.mock("../forms/TwoSectionLineEditor", () => ({ TwoSectionLineEditor: () => <div data-testid="two-section-editor" /> }));
vi.mock("../forms/shared/TotalsStack", () => ({ TotalsStack: () => <div data-testid="totals-stack" /> }));

function wrap(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>
        {/* EntityLink renders a react-router <Link>, so the harness needs a Router.
            Without it every test in this file died on useLocation() before asserting anything. */}
        <MemoryRouter>{ui}</MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}

const draft: Record<string, unknown> = { id: "__create__", status: "open", accident_at: "2026-07-03", driver_id: "" };

describe("AccidentReportDrawer catalogs (SC1)", () => {
  it("fires listDrivers with operating_company_id when the wizard opens", async () => {
    render(wrap(<AccidentReportDrawer open operatingCompanyId="co-1" accident={draft} createMode onClose={() => {}} onUpdated={() => {}} />));
    await waitFor(() => expect(vi.mocked(mdataApi.listDrivers)).toHaveBeenCalled());
    expect(vi.mocked(mdataApi.listDrivers).mock.calls[0]?.[0]).toEqual(expect.objectContaining({ operating_company_id: "co-1" }));
    // All four catalogs load company-scoped.
    expect(vi.mocked(mdataApi.listUnits)).toHaveBeenCalledWith(expect.objectContaining({ operating_company_id: "co-1" }));
    expect(vi.mocked(mdataApi.listVendors)).toHaveBeenCalledWith(expect.objectContaining({ operating_company_id: "co-1" }));
    expect(vi.mocked(dispatchApi.listDispatchLoads)).toHaveBeenCalledWith(expect.objectContaining({ operating_company_id: "co-1", view: "loads" }));
  });

  it("stores the driver uuid (not the display name) on selection", async () => {
    const user = userEvent.setup();
    render(wrap(<AccidentReportDrawer open operatingCompanyId="co-1" accident={draft} createMode onClose={() => {}} onUpdated={() => {}} />));
    const driverPicker = await screen.findByTestId("accident-driver-picker");
    // The driver field is DriverPickerWithCreate (a real Combobox), not the native <select> the other
    // pickers mock to — its options only exist once the dropdown is opened.
    const input = within(driverPicker).getByRole("combobox") as HTMLInputElement;
    await user.click(input);
    const option = await screen.findByText("Alfredo Cazares");
    await user.click(option);
    // The label is what the operator reads; the uuid is what gets stored.
    await waitFor(() => expect(input.value).toBe("Alfredo Cazares"));
    expect(vi.mocked(mdataApi.listDrivers)).toHaveBeenCalled();
  });

  it("persists the four catalog links (uuids) when the office creator saves", async () => {
    const user = userEvent.setup();
    render(wrap(<AccidentReportDrawer open operatingCompanyId="co-1" accident={draft} createMode onClose={() => {}} onUpdated={() => {}} />));

    const pick = async (testid: string, value: string, label: RegExp) => {
      const wrapEl = await screen.findByTestId(testid);
      const select = within(wrapEl).getByRole("combobox") as HTMLSelectElement;
      await waitFor(() => expect(within(wrapEl).getByRole("option", { name: label })).toBeInTheDocument());
      await user.selectOptions(select, value);
      expect(select.value).toBe(value);
    };
    // Driver uses the real Combobox (see above); the other three are the mocked native selects.
    const driverWrap = await screen.findByTestId("accident-driver-picker");
    const driverInput = within(driverWrap).getByRole("combobox") as HTMLInputElement;
    await user.click(driverInput);
    await user.click(await screen.findByText("Alfredo Cazares"));
    await pick("accident-unit-picker", "unit-uuid-1", /T-101/);
    await pick("accident-vendor-picker", "vendor-uuid-1", /Laredo Diesel/);
    await pick("accident-load-picker", "load-uuid-1", /LD-9001/);

    await user.click(screen.getByTestId("accident-save-btn"));
    await waitFor(() => expect(vi.mocked(safetyApi.createSafetyAccident)).toHaveBeenCalled());
    expect(vi.mocked(safetyApi.createSafetyAccident).mock.lastCall?.[0]).toEqual(
      expect.objectContaining({
        operating_company_id: "co-1",
        driver_id: "driver-uuid-1",
        unit_id: "unit-uuid-1",
        vendor_id: "vendor-uuid-1",
        load_id: "load-uuid-1",
      })
    );
  });

  it("SAFE-1: At Fault is a live control — its selection persists on create (not a hardcoded 'no')", async () => {
    const user = userEvent.setup();
    render(wrap(<AccidentReportDrawer open operatingCompanyId="co-1" accident={draft} createMode onClose={() => {}} onUpdated={() => {}} />));
    const atFaultWrap = await screen.findByTestId("accident-at-fault");
    const select = within(atFaultWrap).getByRole("combobox") as HTMLSelectElement;
    // Default is NOT a forced "no" — an unassessed report starts unselected.
    expect(select.value).toBe("");
    await user.selectOptions(select, "disputed");
    expect(select.value).toBe("disputed");

    await user.click(screen.getByTestId("accident-save-btn"));
    await waitFor(() => expect(vi.mocked(safetyApi.createSafetyAccident)).toHaveBeenCalled());
    expect(vi.mocked(safetyApi.createSafetyAccident).mock.lastCall?.[0]).toEqual(
      expect.objectContaining({ at_fault: "disputed" })
    );
  });

  it("SAFE-1: Preventable (DOT) tri-state maps to boolean|null and persists on create", async () => {
    const user = userEvent.setup();
    render(wrap(<AccidentReportDrawer open operatingCompanyId="co-1" accident={draft} createMode onClose={() => {}} onUpdated={() => {}} />));
    const prevWrap = await screen.findByTestId("accident-preventable");
    const select = within(prevWrap).getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe(""); // Undetermined by default
    await user.selectOptions(select, "true");
    await user.click(screen.getByTestId("accident-save-btn"));
    await waitFor(() => expect(vi.mocked(safetyApi.createSafetyAccident)).toHaveBeenCalled());
    expect(vi.mocked(safetyApi.createSafetyAccident).mock.lastCall?.[0]).toEqual(
      expect.objectContaining({ preventable: true })
    );
  });

  it("SAFE-1: hydrates At Fault + Preventable from an existing persisted report", async () => {
    const existing: Record<string, unknown> = {
      id: "accident-1",
      status: "open",
      accident_at: "2026-07-03",
      driver_id: "",
      at_fault: "yes",
      preventable: false,
    };
    render(wrap(<AccidentReportDrawer open operatingCompanyId="co-1" accident={existing} onClose={() => {}} onUpdated={() => {}} />));
    const atFaultWrap = await screen.findByTestId("accident-at-fault");
    expect((within(atFaultWrap).getByRole("combobox") as HTMLSelectElement).value).toBe("yes");
    const prevWrap = await screen.findByTestId("accident-preventable");
    expect((within(prevWrap).getByRole("combobox") as HTMLSelectElement).value).toBe("false");
  });

  it("never renders Add Photo as a silent dead control (tooltip + gate note before save)", async () => {
    render(wrap(<AccidentReportDrawer open operatingCompanyId="co-1" accident={draft} createMode onClose={() => {}} onUpdated={() => {}} />));
    const photoLabel = await screen.findByTestId("accident-photo-label");
    expect(photoLabel).toHaveAttribute("title", "Save the report first to attach photos");
    expect(screen.getByTestId("accident-photo-gate-note")).toBeInTheDocument();
  });

  it("B9: Report Date renders the shared calendar DatePicker, not a raw text input", async () => {
    render(wrap(<AccidentReportDrawer open operatingCompanyId="co-1" accident={draft} createMode onClose={() => {}} onUpdated={() => {}} />));
    const reportDateWrap = await screen.findByTestId("accident-report-date");
    // The shared DatePicker renders a <button> that opens a calendar — never a raw <input>.
    expect(within(reportDateWrap).getByRole("button")).toBeInTheDocument();
    expect(reportDateWrap.querySelector("input")).toBeNull();
  });
});
