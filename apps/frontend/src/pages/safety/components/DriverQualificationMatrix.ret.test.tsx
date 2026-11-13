import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DriverQualificationMatrix } from "./DriverQualificationMatrix";

vi.mock("../../../api/mdata", () => ({
  listAllDrivers: vi.fn().mockResolvedValue({ drivers: [] }),
}));

vi.mock("../../../api/safety", () => ({
  getSafetyKpis: vi.fn().mockResolvedValue({
    drivers_with_open_fines: 2,
    critical_integrity_alerts: 1,
  }),
}));

function wrap(ui: ReactElement, entry = "/safety/driver-files") {
  return (
    <MemoryRouter initialEntries={[entry]}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        {ui}
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe("ROUND 8.20 board24 DriverQualificationMatrix ret", () => {
  afterEach(cleanup);

  it("Open fines register links carry ?ret= Driver Files origin", async () => {
    const user = userEvent.setup();
    render(wrap(<DriverQualificationMatrix companyId="91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071" />));
    await waitFor(() => expect(screen.getByText("Open fines")).toBeTruthy());
    await user.click(screen.getByText("Open fines").closest("button") ?? screen.getByText("Open fines"));
    const civil = await screen.findByTestId("dq-civil-fines-link");
    expect(civil.getAttribute("href") ?? "").toContain("ret=");
    const ret = new URL(civil.getAttribute("href") ?? "", "http://local").searchParams.get("ret");
    expect(decodeURIComponent(ret ?? "")).toContain("/safety/driver-files");
    expect(screen.getByTestId("dq-internal-fines-link").getAttribute("href") ?? "").toContain("ret=");
  });

  it("filtered cohort is preserved in register ret", async () => {
    const user = userEvent.setup();
    render(
      wrap(<DriverQualificationMatrix companyId="91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071" />, "/safety/driver-files?cohort=cdl"),
    );
    await waitFor(() => expect(screen.getByText("Open fines")).toBeTruthy());
    await user.click(screen.getByText("Open fines").closest("button") ?? screen.getByText("Open fines"));
    const civil = await screen.findByTestId("dq-civil-fines-link");
    const ret = new URL(civil.getAttribute("href") ?? "", "http://local").searchParams.get("ret");
    expect(decodeURIComponent(ret ?? "")).toContain("cohort=cdl");
  });
});
