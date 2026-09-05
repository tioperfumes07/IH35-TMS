import type { ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VoidReasonModal } from "../VoidReasonModal";

// VoidReasonModal reads the void/cancel reasons catalog via useCompanyContext + useQuery
// (VOID-REASON-CATALOG-01) — both must be provided or the render throws before any assertion runs.
vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "11111111-1111-4111-8111-111111111111" }),
}));
vi.mock("../../../api/catalogs", () => ({
  listVoidCancelReasons: vi.fn().mockResolvedValue({ reasons: [] }),
}));

function wrap(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

describe("VoidReasonModal — requires a reason, no native dialog", () => {
  it("keeps Void disabled until the reason meets the minimum, then submits the trimmed reason", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      wrap(
        <VoidReasonModal
          open
          title="Void Journal Entry"
          entityRef="JE 07/12/2026 · $1,234.56"
          minLength={3}
          onClose={() => {}}
          onSubmit={onSubmit}
        />,
      ),
    );

    // The audit note + entity ref are shown (QBO/NetSuite parity — not a bare confirm()).
    expect(screen.getByText(/JE 07\/12\/2026/)).toBeTruthy();
    expect(screen.getByText(/reversing entry/i)).toBeTruthy();

    const voidBtn = screen.getByRole("button", { name: "Void" }) as HTMLButtonElement;
    expect(voidBtn.disabled).toBe(true); // empty reason → disabled

    const textarea = screen.getByPlaceholderText(/Required reason/i);
    fireEvent.change(textarea, { target: { value: "ab" } }); // below min
    expect(voidBtn.disabled).toBe(true);

    fireEvent.change(textarea, { target: { value: "  duplicate entry  " } }); // valid (trimmed >= 3)
    expect(voidBtn.disabled).toBe(false);

    fireEvent.click(voidBtn);
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith("duplicate entry"); // trimmed, non-empty reason captured
  });

  it("does not render when closed", () => {
    const onSubmit = vi.fn();
    render(wrap(<VoidReasonModal open={false} title="Void Invoice" onClose={() => {}} onSubmit={onSubmit} />));
    expect(screen.queryByRole("button", { name: "Void" })).toBeNull();
  });
});
