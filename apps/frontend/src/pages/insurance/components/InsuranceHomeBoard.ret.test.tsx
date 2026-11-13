import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InsuranceHomeBoard } from "./InsuranceHomeBoard";

vi.mock("../../../api/insurance", () => ({
  getInsuranceSummary: vi.fn().mockResolvedValue({
    summary: { active_policies: 0, open_claims: 0, coverage_gap_units: 0 },
  }),
  listInsurancePolicies: vi.fn().mockResolvedValue({ policies: [] }),
  listInsuranceTypeCatalog: vi.fn().mockResolvedValue({ types: [] }),
}));

function wrap(ui: ReactElement) {
  return (
    <MemoryRouter initialEntries={["/insurance"]}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        {ui}
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe("ROUND 8.20 board20 InsuranceHomeBoard ret", () => {
  afterEach(cleanup);

  it("Active policies KPI carries ?ret=/insurance", async () => {
    render(wrap(<InsuranceHomeBoard companyId="91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071" />));
    const kpi = await screen.findByTestId("insurance-kpi-active-policies");
    await waitFor(() => expect(kpi.getAttribute("href") ?? "").toContain("ret="));
    expect(decodeURIComponent(kpi.getAttribute("href") ?? "")).toContain("/insurance");
    expect(screen.getByTestId("insurance-kpi-coverage-gaps").getAttribute("href") ?? "").toContain("ret=");
    const fleet = screen.getByTestId("insurance-home-fleet-covered-link");
    expect(fleet.getAttribute("href") ?? "").toContain("ret=");
    expect(decodeURIComponent(fleet.getAttribute("href") ?? "")).toContain("/insurance");
  });
});
