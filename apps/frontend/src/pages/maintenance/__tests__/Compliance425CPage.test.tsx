import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { Compliance425CPage } from "../compliance/Compliance425CPage";

const listLog = vi.fn();
vi.mock("../../../api/maintenance", () => ({ listMaintenanceCompliance425cLog: (...args: unknown[]) => listLog(...args) }));
vi.mock("../../../contexts/CompanyContext", () => ({ useCompanyContext: () => ({ selectedCompanyId: "11111111-1111-4111-8111-111111111111" }) }));

describe("Maintenance Compliance425CPage", () => {
  beforeEach(() => { listLog.mockReset(); listLog.mockResolvedValue({ rows: [], total_count: 0 }); });
  afterEach(cleanup);
  it("requests and renders the exact first range", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter><Compliance425CPage /></MemoryRouter></QueryClientProvider>);
    expect(await screen.findByTestId("maintenance-compliance-425c-pager")).toHaveTextContent("0 of 0");
    expect(listLog).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111", { limit: 50, offset: 0 });
  });
});
