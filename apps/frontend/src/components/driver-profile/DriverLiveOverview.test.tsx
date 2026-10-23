import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { getUnit } from "../../api/mdata";
import { listAllDispatchLoads } from "../../api/dispatch";
import { getPreSettlementForDriver } from "../../api/driverFinance";
import { listLatestPositions } from "../../api/telematics";
import { summarizeDriverDqf } from "../../lib/driverDqf";
import { DriverLiveOverview } from "./DriverLiveOverview";
import type { DriverProfileAggregate } from "../../pages/drivers/DriverProfilePage";

vi.mock("../../api/mdata", () => ({ getUnit: vi.fn() }));
vi.mock("../../api/dispatch", () => ({ listAllDispatchLoads: vi.fn() }));
vi.mock("../../api/driverFinance", () => ({ getPreSettlementForDriver: vi.fn() }));
vi.mock("../../api/telematics", () => ({ listLatestPositions: vi.fn() }));
vi.mock("../../pages/maintenance/components/FleetHealthLine", () => ({ FleetTruck: () => <svg aria-hidden="true" /> }));
vi.mock("../parity/ParityTable", () => ({ ParityTable: ({ rows, columns }: any) => <table><tbody>{rows.map((row: any) => <tr key={row.id}>{columns.map((column: any) => <td key={column.key}>{column.render ? column.render(row) : row[column.key]}</td>)}</tr>)}</tbody></table> }));
const aggregate: DriverProfileAggregate = { driver: { cdl_expires_at: "2027-06-15" }, license: {}, medical_card: {}, drug_program: {}, hos: null, current_assignment: { currently_driving_truck: { unit_id: "unit-fixture", unit_number: "Truck fixture" }, current_load: { load_id: "load-fixture" } } };
function mount(data = aggregate, onReviewDqf = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter><DriverLiveOverview companyId="company-fixture" driverId="driver-fixture" aggregate={data} dqf={summarizeDriverDqf([])} dqfUnavailable={false} onReviewDqf={onReviewDqf} /></MemoryRouter></QueryClientProvider>);
}
describe("Driver live overview reuses source documents", () => {
  beforeEach(() => {
    vi.mocked(getUnit).mockReset().mockResolvedValue({ id: "unit-fixture", unit_number: "Truck fixture", make: "Example", model: "Model", year: 2024 });
    vi.mocked(listLatestPositions).mockReset().mockResolvedValue({ rows: [] });
    vi.mocked(listAllDispatchLoads).mockReset().mockResolvedValue({ loads: [], total_count: 0, has_more: false });
    vi.mocked(getPreSettlementForDriver).mockReset().mockResolvedValue({ settlement: null, legs: [], lines: [] });
  });
  it("scopes every read and does not fabricate speed, pay or paper files", async () => {
    mount();
    expect(await screen.findByText("No open pre-settlement for this driver.")).toBeInTheDocument();
    expect(getPreSettlementForDriver).toHaveBeenCalledWith("driver-fixture", "company-fixture");
    expect(getUnit).toHaveBeenCalledWith("unit-fixture", "company-fixture");
    expect(listAllDispatchLoads).toHaveBeenCalledWith({ operating_company_id: "company-fixture", driver: "driver-fixture", scope: "board", view: "home", status: [] });
    expect(screen.getByText("Speed unavailable")).toBeInTheDocument();
    expect(screen.queryByText("$0.00")).not.toBeInTheDocument();
    expect(screen.queryByText("Paper")).not.toBeInTheDocument();
    expect(screen.getByText("06/15/2027")).toBeInTheDocument();
  });
  it("renders source gross and net without recomputing, with settlement and leg links", async () => {
    vi.mocked(getPreSettlementForDriver).mockResolvedValue({ settlement: { id: "settlement-fixture", display_id: "P-fixture", driver_id: "driver-fixture", status: "open", gross_pay: 1234.56, deductions_total: 12.34, reimbursements_total: 1, net_pay: 1223.22, first_load_id: null, first_load_number: null, last_load_id: null, last_load_number: null, trip_started_at: null, trip_closed_at: null, period_start: "2026-10-19", period_end: "2026-10-25" }, legs: [{ load_id: "load-fixture", load_number: "Load fixture", trip_type: "NB" }], lines: [] });
    mount();
    expect(await screen.findByRole("link", { name: "$1,234.56 gross" })).toHaveAttribute("href", expect.stringContaining("settlement-fixture"));
    expect(screen.getByRole("link", { name: "$12.34 deductions · $1,223.22 net" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "PENDING" })).toBeInTheDocument();
    expect(screen.queryByText("P-fixture")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Load fixture" })).toHaveAttribute("href", "/dispatch/loads/load-fixture");
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });
  it("distinguishes read failures from empty source documents", async () => {
    vi.mocked(getPreSettlementForDriver).mockRejectedValue(new Error("offline"));
    vi.mocked(listAllDispatchLoads).mockRejectedValue(new Error("offline"));
    mount();
    expect(await screen.findByText("Couldn't load open pre-settlement")).toBeInTheDocument();
    expect(await screen.findByText("Couldn't load assigned trips")).toBeInTheDocument();
    expect(screen.queryByText("No open pre-settlement for this driver.")).not.toBeInTheDocument();
  });
  it("does not fetch a default truck as though it were the current assignment", async () => {
    mount({ ...aggregate, current_assignment: { default_truck: { unit_id: "default-fixture" } } });
    await screen.findByText("No open pre-settlement for this driver.");
    expect(getUnit).not.toHaveBeenCalled();
    expect(listLatestPositions).not.toHaveBeenCalled();
    expect(screen.getByText("No current truck assignment")).toBeInTheDocument();
  });
  it("opens the real DQ checklist and never labels a different visa as B-1", async () => {
    const open = vi.fn();
    mount({ ...aggregate, driver: { visa_type: "B2", visa_expires_at: "2030-01-20" } }, open);
    await screen.findByText("No open pre-settlement for this driver.");
    fireEvent.click(screen.getByRole("button", { name: "Qualification file" }));
    expect(open).toHaveBeenCalledOnce();
    expect(screen.queryByText("01/20/2030")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "B-1 visa" })).toHaveAttribute("href", "/drivers/driver-fixture?tab=edit");
  });
});
