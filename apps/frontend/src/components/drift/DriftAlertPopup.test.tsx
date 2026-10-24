import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReconcilerRun } from "../../api/reconciler";
import { DRIFT_CHECK_INTERVAL_MS, DriftAlertPopup, driftRows } from "./DriftAlertPopup";

const COMPANY = "5c854333-6ea5-4faa-af31-67cb272fef80";
const fetchReconcilerExceptions = vi.fn();
vi.mock("../../api/reconciler", async (orig) => {
  const actual = await orig<typeof import("../../api/reconciler")>();
  return { ...actual, fetchReconcilerExceptions: (...args: unknown[]) => fetchReconcilerExceptions(...args) };
});
vi.mock("../../contexts/CompanyContext", () => ({ useCompanyContext: () => ({ selectedCompanyId: COMPANY }) }));

const ex = (field: string, label: string, reason: string) => ({
  key: `I9/load/${label}/${field}`, invariant: "I9", entity_type: "load" as const, entity_id: `id-${label}`, entity_label: label,
  field, reason, since: "2026-10-24T19:40:00Z", since_source: "x", owner_seat: "CC-3", repair_engine: null,
});
function run(exceptions: ReturnType<typeof ex>[]): ReconcilerRun {
  return { operating_company_id: COMPANY, ran_at: "2026-10-24T20:00:00.000Z", exception_count: exceptions.length, errored_invariants: [],
    results: [{ invariant: "I9", title: "drift", status: "ok", exceptions }] };
}
function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter><DriftAlertPopup /></MemoryRouter></QueryClientProvider>);
}

describe("DriftAlertPopup (LEAD 443.327)", () => {
  beforeEach(() => { fetchReconcilerExceptions.mockReset(); try { window.localStorage.clear(); } catch { /* none */ } });

  it("checks every 30 minutes", () => {
    expect(DRIFT_CHECK_INTERVAL_MS).toBe(1_800_000);
  });

  it("shows every open item with its load and what to fix, wrong-place first", async () => {
    fetchReconcilerExceptions.mockResolvedValue(run([
      ex("stop_no_date", "13700", "No appointment date or time on: Pickup Laredo."),
      ex("truck_cannot_make_next_stop", "13693", "T177 is 1,550 miles from Delivery Edison, NJ and that appointment has passed — check the assignment or the stop times."),
    ]));
    mount();
    expect(await screen.findByTestId("drift-alert-popup")).toBeTruthy();
    expect(screen.getByText("2 items need attention")).toBeTruthy();
    const rows = screen.getAllByTestId("drift-alert-row");
    expect(rows[0].textContent).toContain("13693");
    expect(rows[0].textContent).toContain("Wrong place");
    expect(rows[1].textContent).toContain("No stop date");
  });

  it("'Remind me in 30 minutes' hides it and stores the next time", async () => {
    fetchReconcilerExceptions.mockResolvedValue(run([ex("load_no_amount", "13701", "The load has no rate.")]));
    mount();
    fireEvent.click(await screen.findByTestId("drift-alert-remind"));
    await waitFor(() => expect(screen.queryByTestId("drift-alert-popup")).toBeNull());
    const until = Number(window.localStorage.getItem(`ih35.driftAlert.snoozedUntil.${COMPANY}`));
    expect(until - Date.now()).toBeGreaterThan(DRIFT_CHECK_INTERVAL_MS - 5_000);
  });

  it("shows nothing when the engine reports no open item", async () => {
    fetchReconcilerExceptions.mockResolvedValue(run([]));
    mount();
    await waitFor(() => expect(fetchReconcilerExceptions).toHaveBeenCalled());
    expect(screen.queryByTestId("drift-alert-popup")).toBeNull();
  });

  it("orders wrong place, street, rate, date, then the rest", () => {
    const order = driftRows([ex("invoice", "1", ""), ex("stop_no_date", "2", ""), ex("load_no_amount", "3", ""), ex("truck_cannot_make_next_stop", "4", "")]).map((r) => r.field);
    expect(order).toEqual(["truck_cannot_make_next_stop", "load_no_amount", "stop_no_date", "invoice"]);
  });
});
