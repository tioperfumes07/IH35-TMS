import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { DriverFilesTab } from "./DriverFilesTab";

const queries = vi.hoisted(() => vi.fn(() => ({ data: undefined, isError: false })));
vi.mock("@tanstack/react-query", () => ({ useQuery: queries }));
vi.mock("../../../contexts/CompanyContext", () => ({ useCompanyContext: () => ({ selectedCompanyId: "isolated-company" }) }));
vi.mock("../components/DriverQualificationMatrix", () => ({ DriverQualificationMatrix: ({ companyId }: { companyId: string }) => <div data-testid="qualification-board">{companyId}</div> }));
vi.mock("../SafetyLayout", () => ({ useSafetyUiContext: () => ({ clearDriverCounts: () => undefined }) }));
vi.mock("../../drivers/DriverProfilePage", () => ({ DriverProfilePage: () => <div data-testid="legacy-profile" /> }));
vi.mock("../../drivers/DriversListPage", () => ({ DriversListPage: () => <div data-testid="legacy-list" /> }));
vi.mock("../../../components/safety/DriverSafetyCards", () => ({ DriverSafetyCards: () => <div data-testid="legacy-cards" /> }));
vi.mock("../components/TrainingTable", () => ({ TrainingTable: () => <div data-testid="legacy-training" /> }));
afterEach(() => { cleanup(); queries.mockClear(); });

describe("Driver Files is the board, not a wrapper around legacy pages", () => {
  it("mounts only the scoped board without hidden training or management queries", () => {
    const { container } = render(<MemoryRouter><DriverFilesTab /></MemoryRouter>);
    expect(screen.getByTestId("qualification-board").textContent).toBe("isolated-company");
    expect(container.querySelector("details")).toBeNull();
    expect(screen.queryByTestId("legacy-list")).toBeNull();
    expect(screen.queryByTestId("legacy-cards")).toBeNull();
    expect(screen.queryByTestId("legacy-training")).toBeNull();
    expect(queries).not.toHaveBeenCalled();
  });
});
