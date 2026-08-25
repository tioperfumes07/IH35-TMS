import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RecurringBillList } from "../RecurringBillList";

// UI-BACK-BUTTON-IGNORES-REAL-NAVIGATION-HISTORY: the "Back to Bills" arrow was hardcoded to
// /accounting/bills regardless of where the user actually came from -- missed by the earlier
// audit waves because its aria-label wasn't the exact string "Back". Same smart-back fix.
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

describe("RecurringBillList back button", () => {
  const originalState = window.history.state;
  beforeEach(() => navigateSpy.mockClear());
  afterEach(() => window.history.replaceState(originalState, ""));

  it("falls back to /accounting/bills on a direct load/refresh (idx 0)", async () => {
    window.history.replaceState({ idx: 0 }, "");
    renderPage();
    await waitFor(() => screen.getByLabelText("Back to Bills"));
    fireEvent.click(screen.getByLabelText("Back to Bills"));
    expect(navigateSpy).toHaveBeenCalledWith("/accounting/bills");
  });

  it("prefers real history once the user has navigated in-app", async () => {
    window.history.replaceState({ idx: 1, key: "xyz", usr: null }, "");
    renderPage();
    await waitFor(() => screen.getByLabelText("Back to Bills"));
    fireEvent.click(screen.getByLabelText("Back to Bills"));
    expect(navigateSpy).toHaveBeenCalledWith(-1);
    expect(navigateSpy).not.toHaveBeenCalledWith("/accounting/bills");
  });
});
