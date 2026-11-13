import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FactoringHomeBoard } from "./FactoringHomeBoard";

vi.mock("../../../api/factoring", () => ({
  getFactoringSummary: vi.fn().mockResolvedValue({
    outstanding_liability_balance: 0,
    mtd_advanced_total: 0,
    recourse_days: 95,
    cleared_open_cents: 0,
    active_factor_id: null,
    active_factor_profile_id: null,
  }),
  listFactors: vi.fn().mockResolvedValue({ factors: [] }),
  getFactoringRecoursePipeline: vi.fn().mockResolvedValue({ rows: [] }),
  getFactoringChargebacksFees: vi.fn().mockResolvedValue({ history: [] }),
}));

vi.mock("../../../api/factoring-purchases", () => ({
  listFactoringPurchases: vi.fn().mockResolvedValue({ purchases: [] }),
}));

function wrap(ui: ReactElement) {
  return (
    <MemoryRouter initialEntries={["/factoring"]}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        {ui}
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe("ROUND 8.20 board18 FactoringHomeBoard ret", () => {
  afterEach(cleanup);

  it("KPI Chargebacks & fees carries ?ret=/factoring so Back restores Home", async () => {
    render(wrap(<FactoringHomeBoard companyId="91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071" />));
    const kpi = await screen.findByTestId("factoring-kpi-chargebacks");
    await waitFor(() => expect(kpi.getAttribute("href") ?? "").toContain("ret="));
    expect(decodeURIComponent(kpi.getAttribute("href") ?? "")).toContain("/factoring");
    expect(screen.getByTestId("factoring-kpi-true-cost").getAttribute("href") ?? "").toContain("ret=");
  });
});
