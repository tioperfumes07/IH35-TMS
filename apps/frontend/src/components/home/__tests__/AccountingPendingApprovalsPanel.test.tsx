import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AccountingPendingApprovalsPanel } from "../AccountingPendingApprovalsPanel";

const fetchPendingApprovalsGl = vi.fn();

vi.mock("../../../api/accountingHome", () => ({
  fetchPendingApprovalsGl: (...args: unknown[]) => fetchPendingApprovalsGl(...args),
}));

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "11111111-1111-4111-8111-111111111111" }),
}));

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AccountingPendingApprovalsPanel data={undefined} isLoading={false} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// GO-0035-HOME-ACCOUNTING-PENDING-APPROVALS-SILENT-ALL-CLEAR: pendingQuery had no isError branch
// at all -- a failed fetch of the GL journal-approval queue rendered the exact same "No pending
// journal approvals." text as a genuine, successfully-confirmed empty queue. This is a
// maker-checker/GL-approval control silently reporting all-clear on an infrastructure failure.
describe("AccountingPendingApprovalsPanel", () => {
  it("shows a genuine empty approval queue honestly (no red error styling)", async () => {
    fetchPendingApprovalsGl.mockResolvedValueOnce({
      control_available: true,
      pending_journal_approvals: 0,
      exceptions: [],
      items: [],
    });
    const { container } = renderPanel();
    expect(await screen.findByText("No pending journal approvals.")).toBeInTheDocument();
    expect(container.querySelector(".text-red-700")).toBeNull();
  });

  it("never shows 'No pending journal approvals' when the fetch fails -- shows a visible error + Retry instead", async () => {
    fetchPendingApprovalsGl.mockRejectedValueOnce(new Error("network failure"));
    renderPanel();
    expect(await screen.findByText(/Failed to load pending journal approvals/i)).toBeInTheDocument();
    expect(screen.queryByText("No pending journal approvals.")).not.toBeInTheDocument();
    const retry = screen.getByRole("button", { name: "Retry" });

    fetchPendingApprovalsGl.mockResolvedValueOnce({
      control_available: true,
      pending_journal_approvals: 0,
      exceptions: [],
      items: [],
    });
    fireEvent.click(retry);
    expect(await screen.findByText("No pending journal approvals.")).toBeInTheDocument();
  });
});
