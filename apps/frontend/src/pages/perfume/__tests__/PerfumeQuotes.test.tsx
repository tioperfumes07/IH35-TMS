import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as clientApi from "../../../api/client";
import { ToastProvider } from "../../../components/Toast";
import { PerfumeQuotesPanel, toCents } from "../PerfumeQuotesPanel";
import type { PerfumeQuote, PerfumeQuoteRow } from "../../../api/perfume";

vi.mock("../../../api/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../../api/client")>()), apiRequest: vi.fn() }));

// Owner 2026-11-26 18:13 CT: "we need exporters to excel, we need pdfs, we need quotations, and then historoy for quotations".
const row = (id: string, number: string, status: PerfumeQuoteRow["status"], total: number): PerfumeQuoteRow => ({ id, number, company_id: "co1", customer_name: "ZZ Perfumes",
  customer_email: "ana@zz.test", customer_phone: null, quote_date: "2026-11-26", valid_until: "2026-12-31", status, currency: "USD", terms: null, notes: null,
  total_cents: total, cost_cents: total * 0.8, costed_total_cents: total, lines: 1, units: 12 });
const full: PerfumeQuote = { ...row("q1", "QT-000001", "draft", 13500), lines: [{ id: "l1", line_no: 1, item_id: "i1", description: "ZZ · NIGHT · 100 ml", upc: "8099911122334",
  qty: 12, unit_price_cents: 1125, cost_cents: 1000, cost_vendor_id: "v1", cost_vendor: "Supplier A", item_name: "ZZ · NIGHT · 100 ml" }],
  events: [{ id: "e1", kind: "created", detail: { customer: "ZZ Perfumes" }, created_at: "2026-11-27T00:30:00Z", by_email: "jorge@ih35trucking.net" },
    { id: "e2", kind: "line_added", detail: { line_no: 1, description: "ZZ · NIGHT · 100 ml", qty: 12, unit_price_cents: 1125 }, created_at: "2026-11-27T00:31:00Z", by_email: null }] };
const calls: Array<[string, unknown]> = [];
beforeEach(() => {
  calls.length = 0;
  vi.mocked(clientApi.apiRequest).mockImplementation(async (path: string, opts?: { method?: string; body?: unknown }) => {
    if (opts?.method) calls.push([path, opts.body]);
    if (path === "/api/v1/perfume/quotes") return { quotes: [row("q1", "QT-000001", "draft", 13500), row("q2", "QT-000002", "accepted", 50000)] };
    if (path === "/api/v1/perfume/quotes/q1") return full;
    if (path.startsWith("/api/v1/perfume/quotes/q1/status")) return { ok: true };
    throw new Error(`unexpected ${path}`);
  });
});
const mount = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider><PerfumeQuotesPanel /></ToastProvider></QueryClientProvider>);

describe("quotations", () => {
  it("dollars to exact cents", () => {
    expect([toCents("11.25"), toCents("$1,234.5"), toCents("7"), toCents("x")]).toEqual([1125, 123450, 700, null]);
  });
  it("lists quotes, filters by a KPI, opens one with its lines, total, margin and history, and marks it sent", async () => {
    mount();
    const panel = await screen.findByTestId("perfume-quotes-panel");
    await waitFor(() => expect(within(panel).getAllByText("QT-000002").length).toBeGreaterThan(0));
    fireEvent.click(within(screen.getByTestId("perfume-quotes-kpis")).getByText("Draft"));
    await waitFor(() => expect(within(panel).queryAllByText("QT-000002").length).toBe(0));
    fireEvent.click(within(panel).getAllByText("QT-000001")[0]!);
    const ed = await screen.findByTestId("perfume-quote-editor");
    await waitFor(() => expect(within(ed).getByTestId("perfume-quote-total").textContent).toBe("$135.00"));
    expect(within(ed).getByText("11.1%")).toBeTruthy(); // ($11.25 − $10.00) / $11.25 on the line
    expect(within(ed).getAllByText("Line added").length).toBeGreaterThan(0);
    fireEvent.click(within(ed).getByTestId("perfume-quote-status-sent"));
    await waitFor(() => expect(calls).toContainEqual(["/api/v1/perfume/quotes/q1/status", { status: "sent" }]));
    expect(within(ed).getByTestId("perfume-quote-xlsx")).toBeTruthy();
    expect(within(ed).getByTestId("perfume-quote-pdf")).toBeTruthy();
  });
});

describe("Excel export on every quotes table (owner 2026-11-26 18:13 CT: \"we need exporters to excel\")", () => {
  it("the quotes list offers CSV and Excel", async () => {
    mount();
    const panel = await screen.findByTestId("perfume-quotes-panel");
    await waitFor(() => expect(within(panel).getAllByText("QT-000002").length).toBeGreaterThan(0));
    expect(within(panel).getAllByRole("button", { name: /excel/i }).length).toBeGreaterThan(0);
  });
});
