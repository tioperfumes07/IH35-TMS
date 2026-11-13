import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BankingHomeBoard } from "./BankingHomeBoard";

vi.mock("../../../api/banking", () => ({
  getMoneyMap: vi.fn().mockResolvedValue({
    accounts: [],
    totals: { in_cents: 0, out_cents: 0, line_count: 0, pending_review_count: 0 },
  }),
  getBankingTiles: vi.fn().mockResolvedValue({ tiles: [] }),
  getDriftAlerts: vi.fn().mockResolvedValue({ alerts: [] }),
  getPlaidCompanyTransactions: vi.fn().mockResolvedValue({ transactions: [] }),
}));

vi.mock("../../../api/drift", () => ({
  getDriftAlerts: vi.fn().mockResolvedValue({ alerts: [] }),
}));

function wrap(ui: ReactElement) {
  return (
    <MemoryRouter initialEntries={["/banking"]}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        {ui}
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe("ROUND 8.20 board3 BankingHomeBoard Money In cohort", () => {
  afterEach(cleanup);

  it("Money In KPI uses types=money_in + review=all + month dates + ret (cleared ≠ categorized-only)", async () => {
    render(wrap(<BankingHomeBoard companyId="91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071" />));
    const kpi = await screen.findByTestId("banking-kpi-money-in");
    await waitFor(() => expect(kpi.getAttribute("href") ?? "").toContain("ret="));
    const href = kpi.getAttribute("href") ?? "";
    expect(href).toContain("types=money_in");
    expect(href).toContain("review=all");
    expect(href).toContain("date_from=");
    expect(href).toContain("date_to=");
    expect(href).not.toContain("review=categorized");
  });
});
