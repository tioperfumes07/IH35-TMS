import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { isFactoredLoad } from "../../../api/settlementCreator";

// ROUND 443.2 (owner 2026-10-10): "there is no quickpay that should render if confirmed those are factored."
vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "5c854333-6ea5-4faa-af31-67cb272fef80" }),
}));
vi.mock("../../../components/Toast", () => ({ useToast: () => ({ pushToast: vi.fn() }) }));
vi.mock("../../../api/client", () => ({ apiRequest: vi.fn(() => new Promise(() => undefined)) }));

import { SettlementCreatorDrawer } from "../SettlementCreatorDrawer";

function renderDrawer() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <SettlementCreatorDrawer open onClose={() => undefined} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Settlement Creator quick pay (443.2)", () => {
  it("only Faro-factored loads count as factored", () => {
    expect(isFactoredLoad("faro_usmca")).toBe(true);
    expect(isFactoredLoad("faro_transportation")).toBe(true);
    expect(isFactoredLoad("direct")).toBe(false);
    expect(isFactoredLoad(null)).toBe(false);
  });

  it("a factored-only draft renders no QuickPay field and no QuickPay row in the settlement totals", async () => {
    renderDrawer();
    // The default draft is one load factored to faro_usmca.
    const totals = await screen.findByTestId("sc-settlement-totals");
    expect(screen.queryAllByTestId("sc-quickpay-expense")).toHaveLength(0);
    expect(within(totals).queryByText(/QuickPay/i)).toBeNull();
  });
});
