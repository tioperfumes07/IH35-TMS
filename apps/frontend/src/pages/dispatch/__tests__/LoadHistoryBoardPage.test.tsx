/**
 * Row 78 — Dispatch › Load history board: list from GET /api/v1/reports/loads-history, every cell opens its record,
 * the load panel reads the existing history / load-cost rollup / expenses / docs endpoints.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { dispatchSubNavActiveHref } from "../../../components/dispatch/DispatchSubnav";
import { panelTimeline } from "../../../components/dispatch/LoadHistoryDetailPanel";
import {
  cohortTotalsFromRows,
  emptyMilesPct,
  loadHistoryApiParams,
  ratePerMileCents,
  LOAD_HISTORY_ALL_FROM,
} from "../LoadHistoryBoardPage";

const { row, getLoadsHistory, getDispatchLoadHistory, CO } = vi.hoisted(() => {
  const CO = "5c854333-6ea5-4faa-af31-67cb272fef80";
  const LOAD_HISTORY_ALL_FROM = "2000-01-01";
const row = {
  load_id: "11111111-1111-4111-8111-111111111111", load_number: "13689", status: "invoiced", trip_type: "NB",
  customer_id: "c1", customer_name: "JEAR LOGISTICS", driver_id: "d1", driver_name: "RUBEN PEDRO PEREZ GARCIA",
  unit_id: "u1", unit_number: "T173", trailer_id: null, trailer_number: null, customer_po_number: null, customer_wo_number: null,
  origin_city: "Vineland", origin_state: "NJ", destination_city: "Temple", destination_state: "TX",
  pickup_date: "2026-10-17", delivery_date: "2026-10-20", miles_practical: 1559, miles_shortest: null, miles_driven_actual: null,
  miles_deadhead: 328, revenue_cents: 400000, driver_pay_cents: 84911, fuel_cents: 0, margin_cents: 315089,
  invoice_id: "i1", invoice_number: "166-13689", factoring_advance_id: null, factoring_display: null, factoring_status: null,
  settlement_number: "P-0108", settlement_id: "s1",
};
const getLoadsHistory = vi.fn(async () => ({
  date_field: "pickup",
  scope_label: "",
  period: { start: LOAD_HISTORY_ALL_FROM, end: "2026-11-03" },
  pagination: { limit: 200, offset: 0, total: 1 },
  totals: {
    load_count: 194, revenue_cents: 66927672, driver_pay_cents: 0, fuel_cents: 0, margin_cents: 0, ar_invoice_count: 0,
    ar_invoice_amount_cents: 0, loaded_miles: 298185.5, empty_miles: 23099.9, delivered_not_invoiced: 3, customer_count: 85,
  },
  status_counts: [
    { status: "invoiced", count: 125 },
    { status: "closed", count: 56 },
    { status: "delivered_pending_docs", count: 13 },
    { status: "cancelled", count: 4 },
  ],
  rows: [row],
}));
const getDispatchLoadHistory = vi.fn(async () => ({
  load_id: row.load_id, load_number: "13689", operating_company_id: CO,
  rows: [
    { id: "e1", occurred_at: "2026-10-17T12:00:00Z", kind: "status_transition", summary: "Booked → Dispatched", field: null, before_value: null, after_value: null, actor_user_id: null, actor_label: null, source: null, links: [] },
    { id: "e2", occurred_at: "2026-10-18T12:00:00Z", kind: "field_edit", summary: "Rate edited", field: "rate", before_value: "1", after_value: "2", actor_user_id: null, actor_label: null, source: null, links: [] },
  ],
  linked_documents: [{ kind: "invoice", id: "i1", display_id: "166-13689", status: "sent", amount_cents: 400000, occurred_at: null }],
}));
  return { row, getLoadsHistory, getDispatchLoadHistory, CO };
});
vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: CO, companies: [] }),
}));
vi.mock("../../../components/dispatch/DispatchSubnav", async () => {
  const actual = await vi.importActual<typeof import("../../../components/dispatch/DispatchSubnav")>("../../../components/dispatch/DispatchSubnav");
  return { ...actual, DispatchSubnav: () => null };
});
vi.mock("../../../components/dispatch/LoadDetailDrawer", () => ({ LoadDetailDrawer: () => <div data-testid="load-drawer" /> }));

vi.mock("../../../api/reports", async () => {
  const actual = await vi.importActual<typeof import("../../../api/reports")>("../../../api/reports");
  return { ...actual, getLoadsHistory };
});
vi.mock("../../../api/loads", async () => {
  const actual = await vi.importActual<typeof import("../../../api/loads")>("../../../api/loads");
  return { ...actual, getDispatchLoadHistory };
});
vi.mock("../../../api/accounting", async () => {
  const actual = await vi.importActual<typeof import("../../../api/accounting")>("../../../api/accounting");
  return {
    ...actual,
    getLoadCostRollup: vi.fn(async () => ({ load_id: row.load_id, load_number: "13689", revenue_cents: 400000, fuel_cents: 0, expenses_cents: 0, costs_cents: 0, driver_pay_cents: 84911, margin_cents: 315089, net_cents: 315089, margin_pct: 78.8 })),
    listLoadExpenses: vi.fn(async () => ({ rows: [], total: 0, limit: 100, offset: 0 })),
  };
});
vi.mock("../../../api/docs", async () => {
  const actual = await vi.importActual<typeof import("../../../api/docs")>("../../../api/docs");
  return { ...actual, listFiles: vi.fn(async () => ({ files: [], total: 0, limit: 100, offset: 0 })) };
});

function wrap(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{node}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("load history helpers", () => {
  it("rate per loaded mile and empty-mile share", () => {
    expect(ratePerMileCents(400000, 1559)).toBe(257);
    expect(ratePerMileCents(400000, 0)).toBeNull();
    expect(emptyMilesPct(269077.9, 23099.9)).toBe("7.9%");
    expect(emptyMilesPct(0, 0)).toBe("—");
  });
  it("asks the API for cancelled only when the viewer wants them", () => {
    const base = { start: LOAD_HISTORY_ALL_FROM, end: "2026-11-03", dateField: "pickup" as const, customerId: "", driverId: "", unitId: "", status: [] as string[], tripType: [] as string[], includeCancelled: false };
    expect(loadHistoryApiParams(base).include_cancelled).toBe(false);
    expect(loadHistoryApiParams({ ...base, includeCancelled: true }).include_cancelled).toBe(true);
    expect(loadHistoryApiParams({ ...base, status: ["cancelled"] })).toMatchObject({ include_cancelled: true, status: "cancelled" });
  });
  it("panel timeline keeps milestones, leaves field edits to the full change history", () => {
    const kinds = panelTimeline([
      { kind: "status_transition" }, { kind: "field_edit" }, { kind: "assignment" }, { kind: "stop_stamp" }, { kind: "audit" },
    ] as never).map((r) => r.kind);
    expect(kinds).toEqual(["status_transition", "assignment", "stop_stamp"]);
  });
  it("subnav highlights Load history", () => {
    expect(dispatchSubNavActiveHref("/dispatch/load-history", "")).toBe("/dispatch/load-history");
  });
  it("ROUND 8.20 board13 — empty search cohort totals are 0 (KPI matches table)", () => {
    expect(cohortTotalsFromRows([])).toEqual({
      load_count: 0,
      revenue_cents: 0,
      loaded_miles: 0,
      empty_miles: 0,
      customer_count: 0,
      delivered_not_invoiced: 0,
    });
  });
});

describe("LoadHistoryBoardPage", () => {
  it("lists every load from the load hub with booked/cancelled counts, and a cell opens the load panel", async () => {
    const { default: LoadHistoryBoardPage } = await import("../LoadHistoryBoardPage");
    wrap(<LoadHistoryBoardPage />);
    const kpi = await screen.findByTestId("load-history-kpi-loads");
    expect(await within(kpi).findByText("194")).toBeTruthy();
    expect(within(kpi).getByText("198 booked · 4 cancelled")).toBeTruthy();
    expect(getLoadsHistory).toHaveBeenCalledWith(expect.objectContaining({ operating_company_id: CO, from: LOAD_HISTORY_ALL_FROM, include_cancelled: false, limit: 200 }));
    expect(within(screen.getByTestId("load-history-kpi-empty-miles")).getByText("7.2% of all miles")).toBeTruthy();

    // load # / customer / driver / truck / invoice / settlement open their own records
    const table = screen.getByTestId("load-history-table");
    expect(within(table).getByText("Jear Logistics").closest("a")).toBeTruthy();
    expect(within(table).getByText("166-13689").closest("a")).toBeTruthy();
    expect(within(table).getByText("P-0108").closest("a")).toBeTruthy();

    fireEvent.click(screen.getByTestId(`load-history-status-${row.load_id}`));
    const panel = await screen.findByTestId("load-history-detail-panel");
    expect(await within(panel).findByText(/Booked → Dispatched/)).toBeTruthy();
    expect(within(panel).queryByText("Rate edited")).toBeNull();
    expect(await within(panel).findByText("$3,150.89")).toBeTruthy();
    expect(within(panel).getAllByTestId("load-history-panel-linked-doc")).toHaveLength(1);
    expect(screen.getByTestId("load-history-status-counts").textContent).toContain("cancelled 4");
  });
});
