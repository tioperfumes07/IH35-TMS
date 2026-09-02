// @vitest-environment jsdom
// GO-20 slice A (docs/lockdown/GO-20-EIGHT-FEATURES.txt) — "Resolving requires a written reason."
// This asserts the panel renders an open drift alert, blocks resolve with an empty note, and calls
// the resolve API with the typed note once one is provided.
import * as matchers from "@testing-library/jest-dom/matchers";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import * as bankingApi from "../../../api/banking";
import type { DriftAlert } from "../../../api/banking";
import { ToastProvider } from "../../../components/Toast";
import { DriftAlertsPanel } from "./DriftAlertsPanel";

expect.extend(matchers);

vi.mock("../../../api/banking", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../api/banking")>();
  return {
    ...actual,
    getDriftAlerts: vi.fn(),
    resolveDriftAlert: vi.fn(),
  };
});

function wrap(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>
  );
}

const ALERT: DriftAlert = {
  id: "alert-1",
  operating_company_id: "opco-1",
  bank_account_id: "bank-1",
  reconciliation_session_id: "session-1",
  detected_at: new Date().toISOString(),
  as_of_date: "2026-09-01",
  drift_kind: "session_variance",
  bank_balance_cents: 100000,
  book_balance_cents: 95000,
  drift_cents: 5000,
  tolerance_cents: 100,
  severity: "warning",
  resolved_at: null,
  resolved_by_user_id: null,
  resolution_note: null,
  resolving_journal_entry_id: null,
  account_name: "Operating",
  account_mask: "1234",
  institution_name: "Bank of America",
};

describe("DriftAlertsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders an open drift alert with bank/book/diff figures", async () => {
    vi.mocked(bankingApi.getDriftAlerts).mockResolvedValue({ rows: [ALERT], total_count: 1 });
    render(wrap(<DriftAlertsPanel companyId="opco-1" />));
    expect(await screen.findByTestId("drift-alerts-panel")).toBeInTheDocument();
    expect(screen.getByText(/Reconciliation variance/)).toBeInTheDocument();
    expect(screen.getByText(/\$1,000\.00/)).toBeInTheDocument(); // bank balance
    expect(screen.getByText(/\$950\.00/)).toBeInTheDocument(); // book balance
    expect(screen.getByText(/\$50\.00/)).toBeInTheDocument(); // diff
  });

  it("renders nothing when there are no open alerts", async () => {
    vi.mocked(bankingApi.getDriftAlerts).mockResolvedValue({ rows: [], total_count: 0 });
    render(wrap(<DriftAlertsPanel companyId="opco-1" />));
    await waitFor(() => expect(bankingApi.getDriftAlerts).toHaveBeenCalled());
    expect(screen.queryByTestId("drift-alerts-panel")).not.toBeInTheDocument();
  });

  it("refuses to resolve with an empty note, and calls resolveDriftAlert once a note is typed", async () => {
    const user = userEvent.setup();
    vi.mocked(bankingApi.getDriftAlerts).mockResolvedValue({ rows: [ALERT], total_count: 1 });
    vi.mocked(bankingApi.resolveDriftAlert).mockResolvedValue({ id: "alert-1", resolved: true });

    render(wrap(<DriftAlertsPanel companyId="opco-1" />));
    await screen.findByTestId("drift-alerts-panel");

    await user.click(screen.getByTestId("drift-alert-resolve-toggle"));
    await user.click(screen.getByTestId("drift-alert-resolve-submit"));
    expect(bankingApi.resolveDriftAlert).not.toHaveBeenCalled();

    await user.type(screen.getByTestId("drift-alert-resolve-note"), "Confirmed timing difference with the bank.");
    await user.click(screen.getByTestId("drift-alert-resolve-submit"));

    await waitFor(() =>
      expect(bankingApi.resolveDriftAlert).toHaveBeenCalledWith("alert-1", "opco-1", "Confirmed timing difference with the bank.")
    );
  });
});
