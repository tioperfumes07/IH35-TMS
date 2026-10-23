import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SafetyLayout } from "./SafetyLayout";

const queries = vi.hoisted(() => vi.fn(() => ({ data: undefined, isError: false })));
vi.mock("@tanstack/react-query", () => ({ useQuery: queries, useMutation: () => ({ isError: false, mutateAsync: vi.fn() }) }));
vi.mock("../../contexts/CompanyContext", () => ({ useCompanyContext: () => ({ selectedCompanyId: "isolated-company" }) }));
vi.mock("../../components/safety/AnomalyAlertBadge", () => ({ AnomalyAlertBadge: () => null }));
vi.mock("../../components/safety/SafetyGroupNav", () => ({ SafetyGroupNav: () => <nav>Safety tabs</nav> }));
vi.mock("../../components/safety/SafetyDashboardFilter", () => ({ SafetyDashboardFilter: () => <div>Legacy activity filters</div> }));
vi.mock("./components/SafetyKpiRow", () => ({ SafetyKpiRow: () => <div>Legacy KPI strip</div> }));
vi.mock("./components/CSAScoreCard", () => ({ CSAScoreCard: () => <div>Legacy CSA card</div> }));
afterEach(() => { cleanup(); queries.mockClear(); });

describe("Driver Files shell does not mount or fetch the legacy summaries", () => {
  it.each(["/safety/driver-files", "/safety/driver-files/"])("keeps %s board-only", (path) => {
    render(<MemoryRouter initialEntries={[path]}><SafetyLayout /></MemoryRouter>);
    expect(screen.queryByText("Legacy activity filters")).toBeNull();
    expect(screen.queryByText("Legacy KPI strip")).toBeNull();
    expect(screen.queryByText("Legacy CSA card")).toBeNull();
    expect(queries).toHaveBeenCalledTimes(3);
    for (const call of queries.mock.calls as unknown as Array<[{ enabled: boolean }]>) expect(call[0].enabled).toBe(false);
  });
  it("preserves the summaries on their separate activity route", () => {
    render(<MemoryRouter initialEntries={["/safety/driver-activity"]}><SafetyLayout /></MemoryRouter>);
    expect(screen.getByText("Legacy activity filters")).toBeTruthy();
    expect(screen.getByText("Legacy KPI strip")).toBeTruthy();
    for (const call of queries.mock.calls as unknown as Array<[{ enabled: boolean }]>) expect(call[0].enabled).toBe(true);
  });
});
