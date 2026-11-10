import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ImportFaroPurchaseReportAction, ImportLoadHistoryAction } from "../OwnerImportActions";
import { faroPurchasePlan, loadHistoryPlan } from "../ownerImportPlans";

const h = vi.hoisted(() => ({
  role: "Owner",
  importLoads: vi.fn(),
  importFaro: vi.fn(),
}));

vi.mock("../../../auth/useAuth", () => ({ useAuth: () => ({ user: { role: h.role } }) }));
vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "co-1", selectedCompany: { id: "co-1", code: "USMCA" } }),
}));
vi.mock("../../../components/Toast", () => ({ useToast: () => ({ pushToast: vi.fn() }) }));
vi.mock("../../../api/ownerImports", () => ({
  importAlwaysTrackLoadHistory: h.importLoads,
  importFaroPurchaseReport: h.importFaro,
}));

function wrap(ui: React.ReactElement) {
  return render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);
}

const loadsPlan = {
  commit: false,
  row_count: 2,
  booked: { count: 1, charges_cents: 100000 },
  skipped_existing: { count: 0, charges_cents: 0 },
  refused: { count: 1, charges_cents: 50000 },
  not_booked_status: { count: 0, charges_cents: 0 },
  rows: [
    { load_number: "13689", outcome: "would_book_delivered", at_status: "delivered", charges_cents: 100000 },
    { load_number: "13690", outcome: "refused", at_status: "x", charges_cents: 50000, refusal: { code: "driver_not_found", message: "driver Foo not in company" } },
  ],
};

beforeEach(() => {
  h.role = "Owner";
  h.importLoads.mockReset();
  h.importFaro.mockReset();
});

describe("owner import actions", () => {
  it("hides both buttons for a non-Owner", () => {
    h.role = "Dispatcher";
    wrap(<><ImportLoadHistoryAction /><ImportFaroPurchaseReportAction /></>);
    expect(screen.queryByTestId("dispatch-import-load-history")).toBeNull();
    expect(screen.queryByTestId("factoring-import-faro-purchase-report")).toBeNull();
  });

  it("load history: preview shows refused rows with their reason, Post sends commit=true", async () => {
    h.importLoads.mockResolvedValue(loadsPlan);
    wrap(<ImportLoadHistoryAction />);
    fireEvent.click(screen.getByTestId("dispatch-import-load-history"));
    const file = new File(["x"], "history.xlsx");
    fireEvent.change(screen.getByTestId("import-load-history-file"), { target: { files: [file] } });
    fireEvent.click(screen.getByTestId("import-load-history-submit"));
    await waitFor(() => expect(screen.getByTestId("import-load-history-refused")).toBeTruthy());
    expect(h.importLoads).toHaveBeenLastCalledWith({ operatingCompanyId: "co-1", sourceCompanyCode: "USMCA", file, commit: false });
    expect(screen.getByTestId("import-load-history-refused").textContent).toContain("driver Foo not in company");
    h.importLoads.mockResolvedValue({ ...loadsPlan, commit: true });
    fireEvent.click(screen.getByTestId("import-load-history-submit"));
    await waitFor(() => expect(h.importLoads).toHaveBeenCalledTimes(2));
    expect(h.importLoads).toHaveBeenLastCalledWith({ operatingCompanyId: "co-1", sourceCompanyCode: "USMCA", file, commit: true });
  });

  it("faro: preview then Post", async () => {
    h.importFaro.mockResolvedValue({
      commit: false, line_count: 1, already_present: { count: 0, gross_cents: 0 }, posted: { count: 0, gross_cents: 0, purchases: 0 },
      held: { count: 1, gross_cents: 5000 },
      lines: [{ faro_invoice_number: "166-1", purchase_date: null, debtor: null, gross_cents: 5000, net_advance_cents: 4000, outcome: "held", reason: "no invoice 166-1" }],
    });
    wrap(<ImportFaroPurchaseReportAction />);
    fireEvent.click(screen.getByTestId("factoring-import-faro-purchase-report"));
    const file = new File(["a,b"], "p.csv");
    fireEvent.change(screen.getByTestId("import-faro-purchase-report-file"), { target: { files: [file] } });
    fireEvent.click(screen.getByTestId("import-faro-purchase-report-submit"));
    await waitFor(() => expect(screen.getByTestId("import-faro-purchase-report-refused").textContent).toContain("no invoice 166-1"));
    expect(h.importFaro).toHaveBeenLastCalledWith({ operatingCompanyId: "co-1", file, commit: false });
  });
});

describe("plan mappers", () => {
  it("marks refused load rows and held faro lines", () => {
    expect(loadHistoryPlan(loadsPlan as never).rows.map((r) => r.refused)).toEqual([false, true]);
    const p = faroPurchasePlan({
      commit: true, line_count: 1, already_present: { count: 0, gross_cents: 0 }, posted: { count: 0, gross_cents: 0, purchases: 0 },
      held: { count: 1, gross_cents: 1 }, lines: [{ faro_invoice_number: "a", purchase_date: null, debtor: null, gross_cents: 1, net_advance_cents: 1, outcome: "held", reason: "r" }],
    });
    expect(p.rows[0].refused).toBe(true);
    expect(p.summary).toContain("1 held");
  });
});
