import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { PmSchedulePage } from "./PmSchedulePage";
import { createMaintenancePmSchedule } from "../../../api/maintenance";

vi.mock("../../../api/maintenance", () => ({
  listMaintenancePmSchedules: vi.fn().mockResolvedValue({ rows: [] }),
  createMaintenancePmSchedule: vi.fn().mockResolvedValue({ id: "schedule-test" }),
  generateMaintenancePmWorkOrder: vi.fn(),
}));
vi.mock("../../../contexts/CompanyContext", () => ({ useCompanyContext: () => ({ selectedCompanyId: "company-test" }) }));
vi.mock("../../../components/Toast", () => ({ useToast: () => ({ pushToast: vi.fn() }) }));
vi.mock("../../../components/EntityPicker", () => ({ EntityPicker: ({ value }: { value: string }) => <span data-testid="selected-unit">{value}</span> }));
vi.mock("../../../components/Modal", () => ({ Modal: ({ open, children }: { open: boolean; children: React.ReactNode }) => open ? <div>{children}</div> : null }));
vi.mock("../../../components/parity/ParityTable", () => ({ ParityTable: () => <div>PM list</div> }));
vi.mock("../../../components/forms/shared/PageHeader", () => ({ PageHeader: () => <h1>PM Schedule</h1> }));
vi.mock("../../../components/Combobox", () => ({ SelectCombobox: (props: React.SelectHTMLAttributes<HTMLSelectElement>) => <select {...props} /> }));

function renderCreate() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/maintenance/pm-schedule?unit_id=unit-test&create=1"]}><PmSchedulePage /></MemoryRouter></QueryClientProvider>);
}

describe("Fleet Health start PM clock", () => {
  beforeEach(() => { vi.mocked(createMaintenancePmSchedule).mockClear(); });
  it("preselects the linked unit and refuses an absent baseline", async () => {
    renderCreate();
    expect(await screen.findByTestId("selected-unit")).toHaveTextContent("unit-test");
    await userEvent.click(screen.getByTestId("pm-schedule-create-submit"));
    expect(await screen.findByText(/Enter the odometer reading/)).toBeInTheDocument();
    expect(createMaintenancePmSchedule).not.toHaveBeenCalled();
  });
  it("passes a genuine zero baseline to the existing PM writer", async () => {
    renderCreate();
    await userEvent.type(await screen.findByTestId("pm-schedule-last-service-odometer"), "0");
    await userEvent.click(screen.getByTestId("pm-schedule-create-submit"));
    await waitFor(() => expect(createMaintenancePmSchedule).toHaveBeenCalledWith({
      operating_company_id: "company-test", unit_id: "unit-test", pm_type: "oil",
      interval_kind: "miles", interval_value: 10000, last_service_odometer: 0,
    }));
  });
});
