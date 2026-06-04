import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { TireProgramPage } from "../TireProgramPage";

const listUnits = vi.fn();
const listMaintenanceTireBrands = vi.fn();
const getMaintenanceTireLayout = vi.fn();
const listMaintenanceTireEvents = vi.fn();
const listMaintenanceTireAlerts = vi.fn();
const createMaintenanceTireRecord = vi.fn();
const createMaintenanceTireBrand = vi.fn();
const rotateMaintenanceTire = vi.fn();
const replaceMaintenanceTire = vi.fn();
const auditMaintenanceTireTread = vi.fn();

vi.mock("../../../api/maintenance", () => ({
  listMaintenanceTireBrands: (...args: unknown[]) => listMaintenanceTireBrands(...args),
  getMaintenanceTireLayout: (...args: unknown[]) => getMaintenanceTireLayout(...args),
  listMaintenanceTireEvents: (...args: unknown[]) => listMaintenanceTireEvents(...args),
  listMaintenanceTireAlerts: (...args: unknown[]) => listMaintenanceTireAlerts(...args),
  createMaintenanceTireRecord: (...args: unknown[]) => createMaintenanceTireRecord(...args),
  createMaintenanceTireBrand: (...args: unknown[]) => createMaintenanceTireBrand(...args),
  rotateMaintenanceTire: (...args: unknown[]) => rotateMaintenanceTire(...args),
  replaceMaintenanceTire: (...args: unknown[]) => replaceMaintenanceTire(...args),
  auditMaintenanceTireTread: (...args: unknown[]) => auditMaintenanceTireTread(...args),
}));

vi.mock("../../../api/mdata", () => ({
  listUnits: (...args: unknown[]) => listUnits(...args),
}));

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({
    selectedCompanyId: "11111111-1111-4111-8111-111111111111",
    companies: [{ id: "11111111-1111-4111-8111-111111111111", name: "IH35" }],
  }),
}));

vi.mock("../../../components/Toast", () => ({
  useToast: () => ({ pushToast: vi.fn() }),
}));

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <TireProgramPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Maintenance TireProgramPage (B32)", () => {
  beforeEach(() => {
    listUnits.mockReset();
    listMaintenanceTireBrands.mockReset();
    getMaintenanceTireLayout.mockReset();
    listMaintenanceTireEvents.mockReset();
    listMaintenanceTireAlerts.mockReset();
    createMaintenanceTireRecord.mockReset();
    createMaintenanceTireBrand.mockReset();
    rotateMaintenanceTire.mockReset();
    replaceMaintenanceTire.mockReset();
    auditMaintenanceTireTread.mockReset();

    listUnits.mockResolvedValue({ units: [{ id: "unit-1", unit_number: "T-101" }] });
    listMaintenanceTireBrands.mockResolvedValue({ rows: [{ id: "brand-1", name: "Michelin X Line" }] });
    listMaintenanceTireAlerts.mockResolvedValue({ rows: [], count: 0 });
    listMaintenanceTireEvents.mockResolvedValue({ rows: [] });
    getMaintenanceTireLayout.mockResolvedValue({
      positions: [
        {
          code: "STEER-LF",
          group: "steer",
          label: "Steer Left Front",
          record: {
            id: "rec-1",
            position_code: "STEER-LF",
            position_group: "steer",
            brand_name: "Michelin X Line",
            serial_number: "SN-1",
            tread_depth_32nds: 18,
            tread_low_threshold_32nds: 4,
            is_low_tread: false,
          },
        },
        { code: "STEER-RF", group: "steer", label: "Steer Right Front", record: null },
      ],
    });
  });

  it("renders tire program shell with create actions", async () => {
    renderPage();
    expect(screen.getByTestId("maint-tire-program-page")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /\+ Create Tire Record/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /\+ Create Brand/i })).toBeInTheDocument();
  });

  it("loads steer/drive layout after unit selection", async () => {
    const user = userEvent.setup();
    renderPage();
    const select = await screen.findByTestId("tire-program-unit-select");
    await screen.findByRole("option", { name: "T-101" });
    await user.selectOptions(select, "unit-1");
    expect(await screen.findByTestId("tire-layout-steer")).toBeInTheDocument();
    expect(screen.getByText("Michelin X Line")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rotate" })).toBeInTheDocument();
  });

  it("shows low tread alert count banner", async () => {
    listMaintenanceTireAlerts.mockResolvedValue({
      count: 2,
      rows: [{ id: "rec-low", tread_depth_32nds: 3, is_low_tread: true }],
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("tire-program-alert-count")).toHaveTextContent("Low tread alerts: 2");
    });
  });
});
