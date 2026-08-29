import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ComplianceFilingsDueWidget } from "../ComplianceFilingsDueWidget";

const fetchFilingsDashboard = vi.fn();

vi.mock("../../../api/compliance", () => ({
  fetchFilingsDashboard: (...args: unknown[]) => fetchFilingsDashboard(...args),
}));

function renderWidget() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ComplianceFilingsDueWidget operatingCompanyId="11111111-1111-4111-8111-111111111111" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// GO-0035-HOME-COMPLIANCE-FILINGS-DUE-SILENT-ALL-CLEAR: dashboardQ had no isError branch -- a
// failed fetch of the filings-due aggregator (IFTA/2290/property-tax/permits) rendered the exact
// same "0 overdue · 0 due soon · 0 upcoming" / "Nothing overdue or due soon." as a genuinely
// confirmed clean slate, on a regulatory-compliance widget whose real consequence is fines / OOS.
describe("ComplianceFilingsDueWidget", () => {
  it("shows a genuine clean slate honestly (no red error styling)", async () => {
    fetchFilingsDashboard.mockResolvedValueOnce({
      counts: { overdue: 0, due: 0, upcoming: 0, not_yet_tracked: 0 },
      items: [],
    });
    const { container } = renderWidget();
    expect(await screen.findByText("Nothing overdue or due soon.")).toBeInTheDocument();
    expect(container.querySelector(".text-red-700")).toBeNull();
  });

  it("never shows 'Nothing overdue or due soon' when the fetch fails -- shows a visible error + Retry instead", async () => {
    fetchFilingsDashboard.mockRejectedValueOnce(new Error("network failure"));
    renderWidget();
    expect(await screen.findByText(/Failed to load filings due/i)).toBeInTheDocument();
    expect(screen.queryByText("Nothing overdue or due soon.")).not.toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
    const retry = screen.getByRole("button", { name: "Retry" });

    fetchFilingsDashboard.mockResolvedValueOnce({
      counts: { overdue: 0, due: 0, upcoming: 0, not_yet_tracked: 0 },
      items: [],
    });
    fireEvent.click(retry);
    expect(await screen.findByText("Nothing overdue or due soon.")).toBeInTheDocument();
  });
});
