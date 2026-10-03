import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RecurringBillList } from "../RecurringBillList";

const navigateSpy = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateSpy };
});

vi.mock("../../../../api/accounting", () => ({
  listRecurringBillTemplates: vi.fn().mockResolvedValue({ templates: [] }),
  deactivateRecurringBillTemplate: vi.fn(),
  generateRecurringBillNow: vi.fn(),
}));

vi.mock("../../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "co-1" }),
}));

vi.mock("../../../../components/Toast", () => ({
  useToast: () => ({ pushToast: vi.fn() }),
}));

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <RecurringBillList />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// U18 (owner UI register 2026-10-03) — "Back is browser history — becomes a breadcrumb, parent always the module home".
describe("RecurringBillList way back", () => {
  beforeEach(() => navigateSpy.mockClear());

  it("is the module breadcrumb: Accounting / Bills / Recurring Bills", async () => {
    renderPage();
    const accounting = await screen.findByRole("link", { name: "Accounting" });
    expect(accounting).toHaveAttribute("href", "/accounting");
    expect(screen.getByRole("link", { name: "Bills" })).toHaveAttribute("href", "/accounting/bills");
  });

  it("offers no browser-history Back", async () => {
    renderPage();
    await screen.findByRole("link", { name: "Accounting" });
    expect(screen.queryByLabelText("Back to Bills")).toBeNull();
    expect(navigateSpy).not.toHaveBeenCalledWith(-1);
  });
});
