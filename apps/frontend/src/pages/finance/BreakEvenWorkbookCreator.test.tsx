import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../components/Toast";
import { BreakEvenWorkbookCreator } from "./BreakEvenWorkbookCreator";
import * as flagHook from "../../hooks/useFeatureFlag";
import * as scenariosApi from "../../api/financeScenarios";

vi.mock("../../hooks/useFeatureFlag", () => ({ useFeatureFlag: vi.fn() }));

async function renderCreator(liveRevenueCents: number) {
  vi.mocked(flagHook.useFeatureFlag).mockReturnValue({ enabled: true, loading: false, error: null });
  vi.spyOn(scenariosApi, "listScenarios").mockResolvedValue({ scenarios: [] });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <BreakEvenWorkbookCreator operatingCompanyId="co-1" liveMiles={9000} liveRevenueCents={liveRevenueCents} />
        </ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
  // Let the mocked listScenarios() query (fired on mount) resolve and its re-render commit before any
  // interaction, so it can't fire (and warn) after the test has already finished asserting.
  return screen.findByRole("button", { name: /\+ create workbook/i });
}

// GO-0047-PREVIEW-VS-PERSIST-REVENUE-FALLBACK-DROPPED: the preview falls back to liveRevenueCents
// whenever the "Freight revenue" line is untouched, but Save used to send the raw (still-zero)
// revenue line -- a user who filled in only expense lines saw a plausible break-even preview built
// on real live revenue, then silently saved a $0-revenue scenario with a plain success toast.
describe("BreakEvenWorkbookCreator — revenue fallback reaches the saved payload (GO-0047)", () => {
  // Without this, `vi.spyOn` on an already-spied method in a later test returns the SAME mock
  // instance instead of a fresh one (this file has no global restoreMocks/clearMocks config) — its
  // `mock.calls` array accumulates across tests, so a later test's `calls[0]` silently read an
  // EARLIER test's call/payload instead of its own. Caught by this test file itself going flaky
  // across repeated runs (always the non-first test, always inheriting the prior test's typed value)
  // before this fix.
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("saves the live revenue fallback into the revenue line when the user never typed one", async () => {
    const createSpy = vi.spyOn(scenariosApi, "createScenario").mockResolvedValue({ id: "s1" } as never);
    const saveButton = await renderCreator(500000);

    // Fill only an expense line -- "Freight revenue" is deliberately left untouched.
    const fuelInput = screen.getByLabelText("Fuel") as HTMLInputElement;
    fireEvent.focus(fuelInput);
    fireEvent.change(fuelInput, { target: { value: "1000" } });

    expect(saveButton).not.toBeDisabled();
    fireEvent.click(saveButton);

    await waitFor(() => expect(createSpy).toHaveBeenCalled());
    const payload = createSpy.mock.calls[0]![0];
    const revenueLine = payload.line_templates.find((l) => l.category_kind === "revenue");
    expect(revenueLine).toBeTruthy();
    // Must match the live revenue the preview was built on, not the untouched $0 the input still holds.
    expect(revenueLine!.monthly_estimate_cents).toBe(500000);
  });

  it("saves the user's own typed revenue when they explicitly entered one", async () => {
    const createSpy = vi.spyOn(scenariosApi, "createScenario").mockResolvedValue({ id: "s1" } as never);
    const saveButton = await renderCreator(500000);

    const revenueInput = screen.getByLabelText("Freight revenue") as HTMLInputElement;
    fireEvent.focus(revenueInput);
    fireEvent.change(revenueInput, { target: { value: "9000" } });
    fireEvent.click(saveButton);

    await waitFor(() => expect(createSpy).toHaveBeenCalled());
    const payload = createSpy.mock.calls[0]![0];
    const revenueLine = payload.line_templates.find((l) => l.category_kind === "revenue");
    // The user's own explicit entry wins -- never silently overridden by the live fallback.
    expect(revenueLine!.monthly_estimate_cents).toBe(900000);
  });
});
