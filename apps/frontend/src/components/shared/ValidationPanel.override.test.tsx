// Row 28 (443.294) — the pre-dispatch blocker Override is the ONE OverrideButton: no reason text box; the Owner /
// Accountant confirm; the catalog line is handed to the booking.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ValidationPanel } from "./ValidationPanel";

let role = "Owner";
vi.mock("../../auth/useAuth", () => ({ useAuth: () => ({ user: { role } }) }));
vi.mock("../../contexts/CompanyContext", () => ({ useCompanyContext: () => ({ selectedCompanyId: "usmca" }) }));
vi.mock("../../api/catalogs", () => ({ listOverrideReasons: vi.fn(async () => ({ reasons: [] })) }));

const RESULT = {
  blockers: [{ rule_id: "CDL-EXPIRED", severity: "block" as const, message: "CDL expired", evidence: {} }],
  warnings: [],
  info: [],
  can_dispatch: false,
};

function renderPanel(onOverrideBlocker: (ruleId: string, reason: string) => void) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ValidationPanel result={RESULT} allowBlockOverride canOwnerOverride onOverrideBlocker={onOverrideBlocker} />
    </QueryClientProvider>,
  );
}

describe("row 28 — blocker Override is the shared OverrideButton", () => {
  it("renders no reason input; Owner confirm hands the owner_override catalog line to the booking", async () => {
    role = "Owner";
    const onOverrideBlocker = vi.fn();
    renderPanel(onOverrideBlocker);
    expect(document.querySelector('input:not([type="checkbox"]), textarea')).toBeNull();
    fireEvent.click(screen.getByTestId("blocker-override-CDL-EXPIRED"));
    fireEvent.click(screen.getByTestId("blocker-override-CDL-EXPIRED-confirm"));
    await waitFor(() => expect(onOverrideBlocker).toHaveBeenCalledWith("CDL-EXPIRED", "Owner override [owner_override]"));
  });

  it("Accountant confirm stores the accountant_override line", async () => {
    role = "Accountant";
    const onOverrideBlocker = vi.fn();
    renderPanel(onOverrideBlocker);
    fireEvent.click(screen.getByTestId("blocker-override-CDL-EXPIRED"));
    fireEvent.click(screen.getByTestId("blocker-override-CDL-EXPIRED-confirm"));
    await waitFor(() => expect(onOverrideBlocker).toHaveBeenCalledWith("CDL-EXPIRED", "Accountant override [accountant_override]"));
  });
});
