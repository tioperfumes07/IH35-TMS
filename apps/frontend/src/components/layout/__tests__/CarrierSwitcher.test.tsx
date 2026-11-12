import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { CarrierSwitcher } from "../CarrierSwitcher";

vi.mock("../../../auth/useAuth", () => ({ useAuth: () => ({ user: { uuid: "u", role: "Owner" } }) }));
vi.mock("../../../api/perfume", () => ({ getPerfumeAccess: vi.fn(async () => ({ allowed: true })) }));
vi.mock("../../Toast", () => ({ useToast: () => ({ pushToast: vi.fn() }) }));
vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({
    companies: [], selectedCompanyId: "c1", selectedCompany: { id: "c1", short_name: "USMCA Freight", legal_name: "USMCA Freight Solutions Inc" },
    setSelectedCompany: vi.fn(), setDefaultCompanyForUser: vi.fn(),
  }),
}));

describe("CarrierSwitcher panel", () => {
  it("opens outside the overflow-hidden top bar (portaled to body) and shows TIO Perfumes to the desk user", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <div style={{ overflow: "hidden", height: 26 }} data-testid="clipping-strip"><CarrierSwitcher /></div>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByTestId("carrier-switcher-trigger"));
    const panel = await screen.findByTestId("carrier-switcher-panel");
    expect(container.querySelector('[data-testid="clipping-strip"]')?.contains(panel)).toBe(false);
    expect(panel.parentElement).toBe(document.body);
    expect(await screen.findByTestId("carrier-switcher-tio-perfumes")).toBeTruthy();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByTestId("carrier-switcher-panel")).toBeNull();
  });
});
