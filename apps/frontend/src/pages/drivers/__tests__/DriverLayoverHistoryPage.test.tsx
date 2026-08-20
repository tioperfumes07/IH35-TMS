import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as mdataApi from "../../../api/mdata";
import { DriverLayoverHistoryPage } from "../DriverLayoverHistoryPage";

/**
 * DISP-S19: /dispatch/layovers/driver/:driverId renders, is entity-scoped, and shows an honest
 * empty state.
 */

const companyId = "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071";
const driverId = "d1111111-0f3a-4c2d-8e1b-2c3d4e5f6071";

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: companyId, companies: [{ id: companyId }] }),
}));

function wrap(driverIdParam: string | null) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const path = driverIdParam ? `/dispatch/layovers/driver/${driverIdParam}` : "/dispatch/layovers/driver/";
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/dispatch/layovers/driver/:driverId?" element={<DriverLayoverHistoryPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("DriverLayoverHistoryPage (DISP-S19)", () => {
  beforeEach(() => {
    vi.spyOn(mdataApi, "getDriver").mockResolvedValue({
      id: driverId,
      first_name: "Jordan",
      last_name: "Ruiz",
    } as never);
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        expect(String(url)).toContain(`operating_company_id=${companyId}`);
        expect(String(url)).toContain(`driver=${driverId}`);
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: [] }),
        });
      })
    );
  });

  it("renders the driver's name header and scopes the layovers fetch to company + driver", async () => {
    wrap(driverId);
    expect(await screen.findByText("Jordan Ruiz")).toBeTruthy();
    expect(fetch).toHaveBeenCalled();
  });

  it("shows a named honest-empty state (not a silent blank) when there are no layovers in range", async () => {
    wrap(driverId);
    expect(await screen.findByText("No layovers detected in this period.")).toBeTruthy();
  });

  it("shows an honest empty state when no driver is in the route", async () => {
    wrap(null);
    expect(await screen.findByText("No driver selected.")).toBeTruthy();
  });

  it("surfaces a fetch failure honestly instead of a silent blank", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    wrap(driverId);
    expect(await screen.findByText("Couldn't load driver layovers")).toBeTruthy();
  });
});
