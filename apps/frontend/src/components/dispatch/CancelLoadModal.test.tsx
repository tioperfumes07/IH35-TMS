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
      { reason_code: "WEATHER", reason_label: "Weather", requires_owner_approval: false },
    ],
  }),
}));

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
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ reason_code: "CUSTOMER_CANCELLED", billable_to_customer: false })
    );
  });
});
