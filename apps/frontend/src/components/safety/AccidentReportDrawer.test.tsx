import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import * as mdataApi from "../../api/mdata";
import * as dispatchApi from "../../api/dispatch";
import { ToastProvider } from "../Toast";
import { AccidentReportDrawer } from "./AccidentReportDrawer";

// SC1: the four catalogs source from the real company-scoped list functions.
vi.mock("../../api/mdata", () => ({
  listDrivers: vi.fn().mockResolvedValue({
    drivers: [{ id: "driver-uuid-1", first_name: "Alfredo", last_name: "Cazares" }],
    total: 1,
  }),
  listUnits: vi.fn().mockResolvedValue({ units: [{ id: "unit-uuid-1", unit_number: "T-101" }], total: 1 }),
  listVendors: vi.fn().mockResolvedValue({ vendors: [{ id: "vendor-uuid-1", name: "Laredo Diesel" }], total: 1 }),
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

vi.mock("../forms/TwoSectionLineEditor", () => ({ TwoSectionLineEditor: () => <div data-testid="two-section-editor" /> }));
vi.mock("../forms/shared/TotalsStack", () => ({ TotalsStack: () => <div data-testid="totals-stack" /> }));

function wrap(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>{ui}</ToastProvider>
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
    const select = within(driverPicker).getByRole("combobox") as HTMLSelectElement;
    // Option label shows "LAST, First" but the underlying value is the uuid.
    await waitFor(() => expect(within(driverPicker).getByText("Cazares, Alfredo")).toBeInTheDocument());
    await user.selectOptions(select, "driver-uuid-1");
    expect(select.value).toBe("driver-uuid-1");
    expect(select.value).not.toBe("Cazares, Alfredo");
  });

  it("never renders Add Photo as a silent dead control (tooltip + gate note before save)", async () => {
    render(wrap(<AccidentReportDrawer open operatingCompanyId="co-1" accident={draft} createMode onClose={() => {}} onUpdated={() => {}} />));
    const photoLabel = await screen.findByTestId("accident-photo-label");
    expect(photoLabel).toHaveAttribute("title", "Save the report first to attach photos");
    expect(screen.getByTestId("accident-photo-gate-note")).toBeInTheDocument();
  });
});
