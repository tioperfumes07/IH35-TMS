// Row 28 finish (11-03): the 425C carry-forward and the settlement floor use the shared OverrideButton; the confirmed line
// round-trips to a catalog reason_code (no typed sentence ever travels).
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CurrentPeriodTab } from "../../pages/form425c/tabs/CurrentPeriodTab";
import { FloorOverrideDecisionModal } from "../../pages/driver-finance/components/FloorOverrideDecisionModal";
import { overrideReasonCodeOf, overrideReasonText } from "./reasonLine";

let role = "Owner";
const listOverrideReasons = vi.fn(async (_c: string, o: { context: string }) => ({
  reasons: [{ reason_code: "carry_forward_actuals_update", label_en: "Projection updated from current actuals", label_es: "x", contexts: [o.context], role_only: false }],
}));
vi.mock("../../api/catalogs", () => ({ listOverrideReasons: (...a: [string, { context: string }]) => listOverrideReasons(...a) }));
vi.mock("../../auth/useAuth", () => ({ useAuth: () => ({ user: { role } }) }));
vi.mock("../../contexts/CompanyContext", () => ({ useCompanyContext: () => ({ selectedCompanyId: "usmca" }) }));

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

describe("reason line round trip", () => {
  it("overrideReasonCodeOf returns the catalog code of a machine-made line, null for typed text", () => {
    expect(overrideReasonCodeOf(overrideReasonText("hos_reset", "HOS / reset"))).toBe("hos_reset");
    expect(overrideReasonCodeOf("Owner override [owner_override]")).toBe("owner_override");
    expect(overrideReasonCodeOf("CDL is current per FMCSA, record is stale")).toBeNull();
    expect(overrideReasonCodeOf(null)).toBeNull();
  });
});

describe("row 28 — Form 425C carry-forward override is the shared OverrideButton", () => {
  // Every string field of the form reads "" unless set; answers is an empty map.
  const mkForm = (over: Record<string, unknown> = {}) =>
    new Proxy({ answers: {}, hasCarryForward: true, status: "draft", projectionOverrideReason: "", ...over } as Record<string, unknown>, {
      get: (t, k) => (k in t ? t[k as string] : ""),
    }) as never;
  const baseForm = mkForm();
  const profiles = new Proxy({}, { get: () => new Proxy({ name: "USMCA Freight Solutions" } as Record<string, unknown>, { get: (t, k) => (k in t ? t[k as string] : "") }) }) as never;
  function tab(setForm: (u: (p: never) => never) => void, form = baseForm) {
    return wrap(
      <CurrentPeriodTab
        {...({
          activeCompany: "usmca", setActiveCompany: () => {}, month: 1, year: 2026, setMonth: () => {}, setYear: () => {},
          profiles, availableCompanies: [], form, setForm, onCreateOrLoad: () => {}, onImportBanking: () => {}, onSave: () => {},
          onGeneratePdf: () => {}, onMarkFiled: () => {}, onAttachFile: () => {}, exhibitA: [], exhibitB: [], onSaveExhibit: () => {}, savingExhibit: false, attaching: false, loading: false, autoSaveLabel: "",
        } as unknown as Parameters<typeof CurrentPeriodTab>[0])}
      />
    );
  }

  it("no typed Override Reason box; Owner confirm records the owner_override catalog line (context 425c_carry_forward)", async () => {
    role = "Owner";
    const setForm = vi.fn();
    tab(setForm as never);
    expect(screen.queryByText(/Override Reason \(required for carry-forward/i)).toBeNull();
    fireEvent.click(screen.getByTestId("form425c-carry-forward-override-button"));
    fireEvent.click(screen.getByTestId("form425c-carry-forward-override-button-confirm"));
    await waitFor(() => expect(setForm).toHaveBeenCalled());
    const next = (setForm.mock.calls[0][0] as (p: Record<string, unknown>) => Record<string, unknown>)({ projectionOverrideReason: "" });
    expect(next.projectionOverrideReason).toBe("Owner override [owner_override]");
    expect(listOverrideReasons).not.toHaveBeenCalled();
  });

  it("an employee picks from the 425c_carry_forward catalog (dropdown filtered by context)", async () => {
    role = "Manager";
    tab(vi.fn() as never);
    fireEvent.click(screen.getByTestId("form425c-carry-forward-override-button"));
    await waitFor(() => expect(listOverrideReasons).toHaveBeenCalledWith("usmca", { context: "425c_carry_forward" }));
  });

  it("a recorded override shows the line instead of the button", () => {
    role = "Owner";
    tab(vi.fn() as never, mkForm({ projectionOverrideReason: "Owner override [owner_override]" }));
    expect(screen.getByTestId("form425c-carry-forward-override-recorded").textContent).toContain("owner_override");
    expect(screen.queryByTestId("form425c-carry-forward-override-button")).toBeNull();
  });
});

describe("row 28 — settlement net-pay floor override sends the catalog reason_code", () => {
  const details = { net_cents: 1234, floor_cents: 5000 } as never;
  it("Accountant confirm -> reason_code null (server stores accountant_override); no typed reason in the payload", async () => {
    role = "Accountant";
    const onDecide = vi.fn();
    wrap(<FloorOverrideDecisionModal open details={details} onClose={() => {}} onDecide={onDecide} />);
    fireEvent.click(screen.getByTestId("floor-override-confirm"));
    fireEvent.click(screen.getByTestId("floor-override-confirm-confirm"));
    await waitFor(() => expect(onDecide).toHaveBeenCalledWith({ pct: 0, cents: 0, reason_code: null }));
    expect(Object.keys(onDecide.mock.calls[0][0])).not.toContain("reason");
  });
});
