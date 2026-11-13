// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FleetCoveredPage } from "./FleetCoveredPage";

vi.mock("../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "co-board20" }),
}));

vi.mock("../../api/insurance", () => ({
  getInsuranceFleetCovered: vi.fn(async () => ({ units: [] })),
}));

describe("ROUND 8.20 board20 — Fleet Covered Back honors ?ret=", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("PageHeader Back restores Insurance Home when ret is present", async () => {
    const ret = encodeURIComponent("/insurance");
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[`/insurance/fleet-covered?ret=${ret}`]}>
          <Routes>
            <Route path="/insurance/fleet-covered" element={<FleetCoveredPage />} />
            <Route path="/insurance" element={<div data-testid="insurance-home-restored">home</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByTestId("fleet-covered-page")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByTestId("insurance-home-restored")).toBeTruthy();
  });

  it("without ret, Back falls back to /insurance", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/insurance/fleet-covered"]}>
          <Routes>
            <Route path="/insurance/fleet-covered" element={<FleetCoveredPage />} />
            <Route path="/insurance" element={<div data-testid="insurance-home-fallback">home</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByTestId("fleet-covered-page")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByTestId("insurance-home-fallback")).toBeTruthy();
  });
});
