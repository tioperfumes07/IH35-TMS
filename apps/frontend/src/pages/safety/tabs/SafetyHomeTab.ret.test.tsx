import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SafetyHomeTab } from "./SafetyHomeTab";

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071" }),
}));

vi.mock("../../../api/safety", () => ({
  ACTIVITY_WINDOW_OPTIONS: [7, 14, 30],
  getActiveDriverSet: vi.fn().mockResolvedValue({ drivers: [], cache_hit: false, snapshot_at: null }),
  getLatestCsa: vi.fn().mockResolvedValue({ latest: { total_violations: 0 } }),
  getSafetyAccidents: vi.fn().mockResolvedValue({ accidents: [] }),
  getSafetyEventKpis: vi.fn().mockResolvedValue({ kpis: { total: 0, open_count: 0, severe_count: 0 } }),
  getSafetyKpis: vi.fn().mockResolvedValue({
    open_company_violations: 0,
    drivers_with_open_fines: 0,
    critical_integrity_alerts: 0,
  }),
  listSafetyEventLog: vi.fn().mockResolvedValue({ events: [] }),
}));

vi.mock("../../../components/Combobox", () => ({
  Combobox: ({ id, value }: { id: string; value: string }) => <select id={id} data-testid={id} value={value} readOnly />,
}));

function wrap(ui: ReactElement) {
  return (
    <MemoryRouter initialEntries={["/safety/home"]}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        {ui}
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe("ROUND 8.20 SafetyHomeTab ret", () => {
  afterEach(cleanup);

  it("KPI drills carry ?ret=/safety/home", async () => {
    render(wrap(<SafetyHomeTab />));
    const kpi = await screen.findByTestId("safety-home-kpi-total-events");
    await waitFor(() => expect(kpi.getAttribute("href") ?? "").toContain("ret="));
    const ret = new URL(kpi.getAttribute("href") ?? "", "http://local").searchParams.get("ret");
    expect(decodeURIComponent(ret ?? "")).toContain("/safety/home");
    expect(screen.getByTestId("safety-home-kpi-accidents").getAttribute("href") ?? "").toContain("ret=");
    expect(screen.getByTestId("safety-home-kpi-open-fines").getAttribute("href") ?? "").toContain("ret=");
  });
});
