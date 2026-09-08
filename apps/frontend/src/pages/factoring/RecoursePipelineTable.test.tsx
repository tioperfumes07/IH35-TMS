import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { RecoursePipelineTable, type RecoursePipelineRow } from "./RecoursePipelineTable";
import { ToastProvider } from "../../components/Toast";

function wrap(ui: React.ReactElement) {
  return (
    <MemoryRouter>
      <ToastProvider>{ui}</ToastProvider>
    </MemoryRouter>
  );
}

/**
 * NEW-21 (owner 2026-09-08, a real question about this detail view, not a bug report): "what
 * table/section is this, what data should it show ... surface up front, in order: original
 * invoice amount, advance, reserve, fees." Two real gaps this test guards against regressing:
 *   1. invoice_amount had NO column at all -- a stale comment claimed it did.
 *   2. the "Factoring fee" column was wired to a hardcoded `factoringFeeCents: null` -- it
 *      existed in the gear but showed "--" for every row, always, on every consumer.
 */

const fmtCurrency = (value: unknown) => `$${Number(value ?? 0).toFixed(2)}`;
const fmtDate = (value: unknown) => (value ? String(value) : "—");

function baseRow(overrides: Partial<RecoursePipelineRow> = {}): RecoursePipelineRow {
  return {
    factoring_advance_id: "adv-1",
    invoice_reference: "INV-001",
    customer_id: "cust-1",
    customer_name: "Acme Logistics",
    invoice_amount: 3500,
    advance_amount: 3395,
    reserve_amount: 52.5,
    recourse_expiry_date: "2026-12-10",
    days_until_recourse_expiry: 90,
    load_id: null,
    lc_load_number: null,
    lc_driver_id: null,
    lc_driver_name: null,
    lc_unit_number: null,
    lc_settlement_number: null,
    lc_revenue_cents: null,
    lc_costs_cents: null,
    lc_driver_pay_cents: null,
    lc_margin_cents: null,
    ...overrides,
  } as RecoursePipelineRow;
}

function headerTexts(): string[] {
  return [...document.querySelectorAll("thead th")].map((el) => el.textContent?.trim() ?? "").filter(Boolean);
}

describe("RecoursePipelineTable (NEW-21 detail-view column order)", () => {
  it("renders a real Invoice Amount column and orders Invoice Amount, Advance, Reserve, Factoring fee up front", () => {
    render(
      wrap(
        <RecoursePipelineTable
          rows={[baseRow()]}
          fmtCurrency={fmtCurrency}
          fmtDate={fmtDate}
          feesByAdvance={new Map([["adv-1", 52.5]])}
        />,
      ),
    );

    const headers = headerTexts();
    const idx = (label: string) => headers.findIndex((h) => h.includes(label));

    expect(idx("Invoice Amount")).toBeGreaterThanOrEqual(0);
    expect(idx("Advance")).toBeGreaterThan(idx("Invoice Amount"));
    expect(idx("Reserve")).toBeGreaterThan(idx("Advance"));
    expect(idx("Factoring fee")).toBeGreaterThan(idx("Reserve"));

    expect(screen.getByText("$3500.00")).toBeTruthy(); // invoice_amount, real, was never rendered before
  });

  it("Factoring fee column shows the real per-advance fee from feesByAdvance, not a hardcoded dash", () => {
    render(
      wrap(
        <RecoursePipelineTable
          rows={[baseRow({ factoring_advance_id: "adv-2" })]}
          fmtCurrency={fmtCurrency}
          fmtDate={fmtDate}
          feesByAdvance={new Map([["adv-2", 91.73]])}
        />,
      ),
    );
    expect(screen.getByText("$91.73")).toBeTruthy();
  });

  it("without feesByAdvance passed, the fee column stays an honest dash (never fabricates a number)", () => {
    render(
      wrap(<RecoursePipelineTable rows={[baseRow()]} fmtCurrency={fmtCurrency} fmtDate={fmtDate} />),
    );
    // The row's other real dollar values render as before; the fee cell must not show $0.00 as if measured.
    expect(screen.queryByText("$0.00")).toBeNull();
  });
});
