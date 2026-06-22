import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the reasons API so the dropdown is populated deterministically.
vi.mock("../../api/dispatch", () => ({
  listDispatchCancellationReasons: vi.fn().mockResolvedValue({
    reasons: [
      { reason_code: "CUSTOMER_CANCELLED", reason_label: "Customer cancelled", requires_owner_approval: false },
      { reason_code: "EQUIPMENT_ISSUE", reason_label: "Equipment issue", requires_owner_approval: false },
      { reason_code: "DRIVER_WALKOFF", reason_label: "Driver walk-off", requires_owner_approval: true },
    ],
  }),
}));

// Mock current user so the modal's role-aware branch is deterministic (default Owner; overridden per test).
vi.mock("../../api/identity", () => ({
  getMe: vi.fn().mockResolvedValue({ user: { role: "Owner" }, session: {} }),
}));

import { getMe } from "../../api/identity";
import { CancelLoadModal } from "./CancelLoadModal";

function renderWithClient(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("CancelLoadModal — reason selection enables + submits", () => {
  beforeEach(() => vi.clearAllMocks());

  it("selecting a reason + valid notes enables Confirm Cancel and submits the reason_code", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderWithClient(
      <CancelLoadModal open operatingCompanyId="91e0bf0a-133f-4ce8-a734-2586cfa66d96" onClose={vi.fn()} onSubmit={onSubmit} />
    );

    const confirm = screen.getByRole("button", { name: /Confirm Cancel/i });
    expect(confirm).toBeDisabled(); // nothing selected yet

    // Open the dropdown (focus the combobox input) so the options render, like a real user.
    fireEvent.focus(screen.getByPlaceholderText(/Select reason/i));
    const option = await screen.findByRole("option", { name: /Customer cancelled/i });

    // Select a reason via CLICK (touch/automation/click must commit, not just mouseDown).
    fireEvent.click(option);

    // Notes must be >= 20 chars (backend + UI gate).
    fireEvent.change(screen.getByPlaceholderText(/Required notes/i), {
      target: { value: "Customer called to cancel the load this morning." },
    });

    await waitFor(() => expect(confirm).toBeEnabled());

    fireEvent.click(confirm);
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    // Contract fix (the cancel bug): payload MUST carry cancel_reason_code (enum) + cancel_reason (text)
    // — the field names the backend cancel hook requires — not just the legacy reason_code.
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        cancel_reason_code: "CUSTOMER_CANCELLED",
        cancel_reason: "Customer cancelled",
        reason_code: "CUSTOMER_CANCELLED",
        billable_to_customer: false,
      })
    );
  });

  it("surfaces the API error instead of silently hanging (the compounding bug)", async () => {
    const { ApiError } = await import("../../api/client");
    const onSubmit = vi
      .fn()
      .mockRejectedValue(new ApiError(400, { error: "validation_error", details: { message: "cancel_reason_code is required" } }));
    renderWithClient(
      <CancelLoadModal open operatingCompanyId="91e0bf0a-133f-4ce8-a734-2586cfa66d96" onClose={vi.fn()} onSubmit={onSubmit} />
    );
    fireEvent.focus(screen.getByPlaceholderText(/Select reason/i));
    fireEvent.click(await screen.findByRole("option", { name: /Customer cancelled/i }));
    fireEvent.change(screen.getByPlaceholderText(/Required notes/i), {
      target: { value: "Customer called to cancel the load this morning." },
    });
    await waitFor(() => expect(screen.getByRole("button", { name: /Confirm Cancel/i })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: /Confirm Cancel/i }));
    // The error renders (form stays open + editable), not a silent hang.
    expect(await screen.findByRole("alert")).toHaveTextContent(/cancel_reason_code is required/i);
  });

  it("Owner + approval-required reason → 'Approve & Cancel' (inline approve, not a dead-end)", async () => {
    vi.mocked(getMe).mockResolvedValue({ user: { role: "Owner" }, session: {} } as never);
    renderWithClient(
      <CancelLoadModal open operatingCompanyId="91e0bf0a-133f-4ce8-a734-2586cfa66d96" onClose={vi.fn()} onSubmit={vi.fn()} />
    );
    fireEvent.focus(screen.getByPlaceholderText(/Select reason/i));
    fireEvent.click(await screen.findByRole("option", { name: /Driver walk-off/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Approve & Cancel/i })).toBeInTheDocument());
    expect(screen.getByText(/approve & cancel this load immediately/i)).toBeInTheDocument();
  });

  it("non-owner + approval-required reason → 'Submit cancel request'", async () => {
    vi.mocked(getMe).mockResolvedValue({ user: { role: "Dispatcher" }, session: {} } as never);
    renderWithClient(
      <CancelLoadModal open operatingCompanyId="91e0bf0a-133f-4ce8-a734-2586cfa66d96" onClose={vi.fn()} onSubmit={vi.fn()} />
    );
    fireEvent.focus(screen.getByPlaceholderText(/Select reason/i));
    fireEvent.click(await screen.findByRole("option", { name: /Driver walk-off/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Submit cancel request/i })).toBeInTheDocument());
    expect(screen.getByText(/submitted for Owner approval/i)).toBeInTheDocument();
  });
});
