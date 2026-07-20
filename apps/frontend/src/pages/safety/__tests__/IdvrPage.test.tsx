import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { IdvrPage } from "../IdvrPage";

const navigateSpy = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateSpy,
  };
});

vi.mock("../../../api/safety", () => ({
  getSafetyDvirSubmissions: vi.fn(async () => ({
    submissions: [
      {
        id: "dvir-1",
        submitted_at: "2026-06-03T10:00:00Z",
        driver_name: "Alex Driver",
        unit_number: "T-101",
        type: "pre_trip",
        defect_count: 1,
        defect_severity: "minor",
        follow_up_wo_id: "wo-1",
      },
    ],
  })),
}));

function wrap(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/safety/idvr"]}>
        <Routes>
          <Route path="/safety/idvr" element={ui} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("IdvrPage", () => {
  it("renders office list surface", async () => {
    render(wrap(<IdvrPage operatingCompanyId="11111111-1111-4111-8111-111111111111" />));
    expect(screen.getByTestId("idvr-page")).toBeTruthy();
    expect(await screen.findByTestId("idvr-table")).toBeTruthy();
  });

  it("renders filter controls", () => {
    render(wrap(<IdvrPage operatingCompanyId="11111111-1111-4111-8111-111111111111" />));
    expect(screen.getByTestId("idvr-filter-from")).toBeTruthy();
    expect(screen.getByTestId("idvr-filter-driver")).toBeTruthy();
  });

  it("navigates to DVIR detail on row click", async () => {
    navigateSpy.mockClear();
    const user = userEvent.setup();
    render(wrap(<IdvrPage operatingCompanyId="11111111-1111-4111-8111-111111111111" />));
    await user.click(await screen.findByTestId("idvr-row-dvir-1"));
    expect(navigateSpy).toHaveBeenCalledWith("/safety/idvr/dvir-1");
  });
});
