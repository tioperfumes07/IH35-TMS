import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as clientApi from "../../../api/client";
import { ToastProvider } from "../../../components/Toast";
import { PerfumeOrdersPanel } from "../PerfumeOrdersPanel";
import { PerfumePurchasesPanel } from "../PerfumePurchasesPanel";
import { PerfumeItemProfilesPanel, PerfumeSupplierProfilesPanel } from "../PerfumeProfilesPanel";
import type { PerfumeItemProfile, PerfumeOrder, PerfumeOrderRow, PerfumePo, PerfumePoRow, PerfumeVendorProfile } from "../../../api/perfume";

vi.mock("../../../api/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../../api/client")>()), apiRequest: vi.fn() }));

// Owner 2026-11-26 19:12 CT: "sales order and purchase ordres should already be created, i need my complete customer and vendors
// profile … full and total complete linkage".
const orow = (id: string, number: string, status: PerfumeOrderRow["status"], pos: number): PerfumeOrderRow => ({ id, number, quote_id: "q1", quote_number: "QT-000001",
  company_id: "co1", customer_name: "ZZ Perfumes", customer_email: null, customer_phone: null, ship_to: null, order_date: "2026-11-26", ship_by: null, status, currency: "USD",
  terms: null, notes: null, purchase_orders: pos, total_cents: 27100, cost_cents: 18000, costed_total_cents: 27000, lines: 3, units: 15, units_shipped: 0 });
const order: PerfumeOrder = { ...orow("o1", "SO-000001", "open", 0), lines: [
  { id: "l1", line_no: 1, item_id: "i1", description: "ZZ · NIGHT · 100 ml", upc: "8099922233441", qty: 10, qty_shipped: 0, unit_price_cents: 1500, cost_cents: 1000, cost_vendor_id: "vA", cost_vendor: "Vendor A" },
  { id: "l2", line_no: 2, item_id: null, description: "Gift bag", upc: null, qty: 1, qty_shipped: 0, unit_price_cents: 100, cost_cents: null, cost_vendor_id: null, cost_vendor: null }],
  events: [{ id: "e1", kind: "created", detail: { customer: "ZZ Perfumes", from_quote: "QT-000001" }, created_at: "2026-11-27T01:00:00Z", by_email: null }] };
const prow = (id: string, number: string, status: PerfumePoRow["status"]): PerfumePoRow => ({ id, number, vendor_id: "vA", vendor_name: "Vendor A", vendor_contact: null,
  sales_order_id: "o1", sales_order_number: "SO-000001", sales_order_customer: "ZZ Perfumes", order_date: "2026-11-26", expected_by: null, status, currency: "USD", terms: null,
  notes: null, total_cents: 10000, lines: 1, units: 10, units_received: 0 });
const po: PerfumePo = { ...prow("p1", "PO-000001", "open"), lines: [{ id: "pl1", line_no: 1, sales_order_line_id: "l1", item_id: "i1", price_list_row_id: "r1", vendor_sku: "A-NIGHT",
  description: "ZZO NIGHT EDP 3.4OZ M", upc: "8099922233441", qty: 10, qty_received: 0, unit_cost_cents: 1000 }], events: [] };
const calls: Array<[string, unknown]> = [];
let made = false;
beforeEach(() => {
  calls.length = 0; made = false;
  vi.mocked(clientApi.apiRequest).mockImplementation(async (path: string, opts?: { method?: string; body?: unknown }) => {
    if (opts?.method) calls.push([path, opts.body]);
    if (path === "/api/v1/perfume/orders") return { orders: [orow("o1", "SO-000001", "open", made ? 1 : 0), orow("o2", "SO-000002", "shipped", 1)] };
    if (path === "/api/v1/perfume/orders/o1") return order;
    if (path === "/api/v1/perfume/orders/o1/purchase-orders") return { purchase_orders: made ? [prow("p1", "PO-000001", "open")] : [] };
    if (path === "/api/v1/perfume/orders/o1/purchase") { made = true; return { purchase_orders: [{ id: "p1", number: "PO-000001", vendor_id: "vA", lines: 1 }], skipped: [{ line_no: 2, description: "Gift bag", reason: "no item on the line" }] }; }
    if (path === "/api/v1/perfume/purchase-orders") return { purchase_orders: [prow("p1", "PO-000001", "open"), prow("p2", "PO-000002", "received")] };
    if (path === "/api/v1/perfume/purchase-orders/p1") return po;
    if (path === "/api/v1/perfume/purchase-orders/p1/receive-all") return { lines: 1 };
    if (path === "/api/v1/perfume/vendors") return { vendors: [{ id: "vA", name: "Vendor A", short_name: "VA", kind: "buy", roles: [], contact: null }] };
    if (path === "/api/v1/perfume/vendors/vA/profile") return { vendor: { id: "vA", name: "Vendor A", short_name: "VA", kind: "buy", roles: [], contact: null, company_id: "co9" },
      company: { id: "co9", name: "Vendor A LLC", role: "vendor", vendor_type: null, customer_type: null, phone: "+1 305 000 0000", website: "vendora.test", address: null, city: "Miami",
        state: "FL", country: "US", status: "active", people: 2, email: "sales@vendora.test" },
      lists: [{ id: "L1", list_date: "2026-11-26", label: null, file_name: "a.xlsx", source_kind: "xlsx", rows_saved: 120, is_current: true, voided_at: null, matched: 118, waiting: 2 }],
      items: 118, waiting: 2, codes: 118, words: 117, confirmed: 3, purchase_orders: [prow("p1", "PO-000001", "open")], po_total_cents: 10000, po_open: 1 } satisfies PerfumeVendorProfile;
    if (path === "/api/v1/perfume/items/i1/profile") return { item: { id: "i1", internal_code: "T-1", brand: "ZZ", name: "NIGHT", size_ml: "100", conc: "EDP", gender: "M", flags: [], display_name: "ZZ · NIGHT · 100 ml" },
      upcs: ["8099922233441"], best_cost_cents: 1000,
      vendor_lines: [{ id: "r1", vendor_id: "vA", vendor: "Vendor A", kind: "buy", sku: "A-NIGHT", upc: null, brand: null, description: "ZZO NIGHT EDP 3.4OZ M", size_text: null, price_cents: 1000, qty: null, match_method: "alias", list_date: "2026-11-26" }],
      remembered: [{ id: "a1", vendor: "Vendor A", vendor_id: "vA", sku: null, text_key: "ZZO NIGHT EDP 3.4OZ M", method: "import", confirmed_at: null }],
      quotes: [], orders: [orow("o1", "SO-000001", "open", 1)], purchase_orders: [prow("p1", "PO-000001", "open")] } satisfies PerfumeItemProfile;
    if (path === "/api/v1/perfume/inventory/sites") return { sites: [{ code: "008", name: "Perfume Bodega Laredo", kind: "warehouse", own: true, active: true, address: null, sort_order: 10, units: 0, items: 0, fifo_value_cents: 0 }] };
    if (path === "/api/v1/perfume/items/i1/lots") return { lots: [{ id: "lt1", location_code: "008", lot_code: "L-A", source: "receipt", received_on: "2026-11-26", qty_in: 10, qty_left: 4, unit_cost_cents: 1000, vendor: "Vendor A", po_line_id: "pl1", po_number: "PO-000001", po_id: "p1" }], stock: [] };
    throw new Error(`unexpected ${path}`);
  });
});
function Where() { const l = useLocation(); return <div data-testid="where">{l.search}</div>; }
const mount = (ui: React.ReactNode, at = "/perfume") => render(
  <MemoryRouter initialEntries={[at]}><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider>{ui}<Where /></ToastProvider></QueryClientProvider></MemoryRouter>);

describe("sales orders", () => {
  it("opens from ?open=, links back to its quote, Buy makes the POs and lists what it could not buy, the PO links to its tab", async () => {
    mount(<PerfumeOrdersPanel />, "/perfume?tab=orders&open=o1");
    const ed = await screen.findByTestId("perfume-order-editor");
    await waitFor(() => expect(within(ed).getByTestId("perfume-order-total").textContent).toBe("$151.00"));
    expect(within(ed).getByTestId("perfume-order-quote-link").textContent).toBe("QT-000001");
    fireEvent.click(within(ed).getByTestId("perfume-order-buy"));
    await waitFor(() => expect(calls.map((c) => c[0])).toContain("/api/v1/perfume/orders/o1/purchase"));
    expect((await within(ed).findByTestId("perfume-order-skipped")).textContent).toContain("Gift bag");
    fireEvent.click(await within(ed).findByTestId("perfume-order-po-PO-000001"));
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("?tab=purchases&open=p1"));
  });
  it("the 'nothing bought yet' KPI narrows the list", async () => {
    mount(<PerfumeOrdersPanel />);
    const panel = await screen.findByTestId("perfume-orders-panel");
    await waitFor(() => expect(within(panel).getAllByText("SO-000002").length).toBeGreaterThan(0));
    fireEvent.click(within(screen.getByTestId("perfume-orders-kpis")).getByText("Open, nothing bought yet"));
    await waitFor(() => expect(within(panel).queryAllByText("SO-000002").length).toBe(0));
  });
});

describe("purchase orders", () => {
  it("shows the vendor's own code and words, receives all, links to the vendor profile and the sales order", async () => {
    mount(<PerfumePurchasesPanel />, "/perfume?tab=purchases&open=p1");
    const ed = await screen.findByTestId("perfume-po-editor");
    await waitFor(() => expect(within(ed).getAllByText("A-NIGHT").length).toBeGreaterThan(0));
    expect(within(ed).getAllByText(/ZZO NIGHT EDP 3.4OZ M/).length).toBeGreaterThan(0);
    fireEvent.click(within(ed).getByTestId("perfume-po-receive-all"));
    await waitFor(() => expect(calls.map((c) => c[0])).toContain("/api/v1/perfume/purchase-orders/p1/receive-all"));
    fireEvent.click(within(ed).getByTestId("perfume-po-vendor-link"));
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("?tab=suppliers&open=vA"));
  });
});

describe("profiles", () => {
  it("supplier profile: its company in Contacts, what the desk remembered, its lists and POs", async () => {
    mount(<PerfumeSupplierProfilesPanel />, "/perfume?tab=suppliers&open=vA");
    const p = await screen.findByTestId("perfume-vendor-profile");
    await waitFor(() => expect(within(p).getByTestId("perfume-vendor-company").textContent).toContain("Vendor A LLC"));
    expect(within(within(p).getByTestId("perfume-vendor-kpis")).getByText("117")).toBeTruthy();
    expect(within(p).getAllByText("PO-000001").length).toBeGreaterThan(0);
  });
  it("item profile: every vendor's code and words, what is remembered, and its documents", async () => {
    mount(<PerfumeItemProfilesPanel />, "/perfume?tab=items&open=i1");
    const p = await screen.findByTestId("perfume-item-profile");
    await waitFor(() => expect(within(p).getAllByText("A-NIGHT").length).toBeGreaterThan(0));
    expect(within(p).getAllByText("Their words (remembered)").length).toBeGreaterThan(0);
    expect(within(p).getByTestId("perfume-item-upcs").textContent).toContain("8099922233441");
    expect(within(p).getAllByText("SO-000001").length).toBeGreaterThan(0);
    // Its stock: each lot with its vendor and the PO that brought it in.
    await waitFor(() => expect(within(p).getAllByText("4 of 10").length).toBeGreaterThan(0));
  });
});
