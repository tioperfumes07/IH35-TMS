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
let linkedB = false;
let linkRows = false;
beforeEach(() => {
  calls.length = 0; made = false; linkedB = false; linkRows = false;
  vi.mocked(clientApi.apiRequest).mockImplementation(async (path: string, opts?: { method?: string; body?: unknown }) => {
    if (opts?.method) calls.push([path, opts.body]);
    if (path === "/api/v1/perfume/orders") return { orders: [orow("o1", "SO-000001", "open", made ? 1 : 0), orow("o2", "SO-000002", "shipped", 1)] };
    if (path === "/api/v1/perfume/orders/o1") return order;
    if (path === "/api/v1/perfume/orders/o1/purchase-orders") return { purchase_orders: made ? [prow("p1", "PO-000001", "open")] : [] };
    if (path === "/api/v1/perfume/orders/o1/purchase") { made = true; return { purchase_orders: [{ id: "p1", number: "PO-000001", vendor_id: "vA", lines: 1 }], skipped: [{ line_no: 2, description: "Gift bag", reason: "no item on the line" }] }; }
    if (path === "/api/v1/perfume/purchase-orders") return { purchase_orders: [prow("p1", "PO-000001", "open"), prow("p2", "PO-000002", "received")] };
    if (path === "/api/v1/perfume/purchase-orders/p1") return po;
    if (path === "/api/v1/perfume/purchase-orders/p1/receive-all") return { lines: 1 };
    if (path === "/api/v1/scentsx/purchase-orders/p1/billable") return { lines: [{ po_line_id: "pl1", line_no: 1, item_id: "i1", description: "ZZO NIGHT EDP 3.4OZ M", ordered: 10,
      received: 10, received_value_cents: 10000, billed: 4, billed_received_value_cents: 4000, billed_value_cents: 4000, credited: 0, credited_received_value_cents: 0,
      credited_value_cents: 0, to_bill: 6, to_credit: 0, unit_cost_cents: 1000 }], bills: [] };
    if (path === "/api/v1/scentsx/accounts") return { accounts: [{ id: "a5000", account_number: "5000", account_name: "Cost of Goods Sold", account_type: "cogs", account_subtype: null, roles: [], debit_cents: "0", credit_cents: "0" }] };
    if (path === "/api/v1/scentsx/purchase-orders/p1/bill") return { bill_id: "b1", display_id: "BILL-2026-00001", amount_cents: 7850, journal_entry_id: "j1", variance_cents: -600,
      variance_journal_entry_id: "j2", units: 6 };
    if (path === "/api/v1/perfume/vendors") return { vendors: [{ id: "vA", name: "Vendor A", short_name: "VA", kind: "buy", roles: [], contact: null }] };
    if (path === "/api/v1/perfume/vendors/vA/profile") return { vendor: { id: "vA", name: "Vendor A", short_name: "VA", kind: "buy", roles: [], contact: null, company_id: "co9" },
      company: { id: "co9", name: "Vendor A LLC", role: "vendor", vendor_type: null, customer_type: null, phone: "+1 305 000 0000", website: "vendora.test", address: null, city: "Miami",
        state: "FL", country: "US", status: "active", people: 2, email: "sales@vendora.test" },
      lists: [{ id: "L1", list_date: "2026-11-26", label: null, file_name: "a.xlsx", source_kind: "xlsx", rows_saved: 120, is_current: true, voided_at: null, matched: 118, waiting: 2 }],
      items: 118, waiting: 2, codes: 118, words: 117, confirmed: 3, purchase_orders: [prow("p1", "PO-000001", "open")], po_total_cents: 10000, po_open: 1 } satisfies PerfumeVendorProfile;
    if (path === "/api/v1/perfume/vendor-links/preview") return linkRows ? { linked: 3, unlinked: 2, proposals: [
      { vendor_id: "vA", vendor: "Vendor A — ARABIC list", short_name: "VA", kind: "buy", company_name: "Vendor A", action: "choose", company_id: "co9",
        candidates: [{ id: "co9", name: "Vendor A LLC", role: "vendor", city: "Miami", state: "FL", country: "US", people: 2, exact: true },
          { id: "co8", name: "Vendor A LLC", role: "customer", city: "Doral", state: "FL", country: "US", people: 0, exact: true }] },
      { vendor_id: "vN", vendor: "Nobody Fragrance (NF)", short_name: "NF", kind: "buy", company_name: "Nobody Fragrance", action: "create", company_id: null, candidates: [] }] }
      : { linked: 3, unlinked: 0, proposals: [] };
    if (path === "/api/v1/perfume/vendor-links/apply") { linkRows = false; return { linked: 2, created: 1 }; }
    if (path === "/api/v1/perfume/vendors/vB/company") { linkedB = true; return { ok: true }; }
    if (path === "/api/v1/perfume/vendors/vB/profile") {
      const co = { id: "co7", name: "Vendor B Inc", role: "vendor", vendor_type: null, customer_type: null, phone: null, website: null, address: null, city: "Doral",
        state: "FL", country: "US", status: "active", people: 1, email: null };
      return { vendor: { id: "vB", name: "Vendor B", short_name: "VB", kind: "buy", roles: [], contact: null, company_id: linkedB ? "co7" : null },
        company: linkedB ? co : null, suggestions: linkedB ? [] : [co], lists: [], items: 0, waiting: 0, codes: 0, words: 0, confirmed: 0, purchase_orders: [], po_total_cents: 0, po_open: 0 } satisfies PerfumeVendorProfile;
    }
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

describe("vendor bill from a received PO", () => {
  it("bills the units received and not billed at the vendor's price, with freight, through the ScentsX bill route", async () => {
    mount(<PerfumePurchasesPanel />, "/perfume?tab=purchases&open=p1");
    const box = await screen.findByTestId("perfume-po-bills");
    await waitFor(() => expect(box.textContent).toContain("6 units received and not billed"));
    fireEvent.click(within(box).getByTestId("perfume-po-bill-open"));
    const f = await within(box).findByTestId("perfume-po-bill-form");
    expect((within(f).getByTestId("perfume-po-bill-save") as HTMLButtonElement).disabled).toBe(true); // no vendor invoice # yet
    fireEvent.change(within(f).getByTestId("perfume-po-bill-no"), { target: { value: "INV-77" } });
    fireEvent.change(within(f).getByLabelText("Vendor price line 1"), { target: { value: "11.00" } });
    fireEvent.click(within(f).getByTestId("perfume-po-bill-add-charge"));
    fireEvent.change(within(f).getByLabelText("Charge 1 account"), { target: { value: "a5000" } });
    fireEvent.change(within(f).getByLabelText("Charge 1 description"), { target: { value: "Freight in" } });
    fireEvent.change(within(f).getByLabelText("Charge 1 amount"), { target: { value: "12.00" } });
    await waitFor(() => expect(within(f).getByTestId("perfume-po-bill-total").textContent).toContain("$78.00"));
    expect(within(f).getByTestId("perfume-po-bill-variance").textContent).toContain("$6.00");
    fireEvent.click(within(f).getByTestId("perfume-po-bill-save"));
    await waitFor(() => expect(calls).toContainEqual(["/api/v1/scentsx/purchase-orders/p1/bill", expect.objectContaining({ vendor_invoice_number: "INV-77",
      lines: [{ po_line_id: "pl1", qty: 6, unit_price_cents: 1100 }], charges: [{ account_id: "a5000", description: "Freight in", amount_cents: 1200 }] })]));
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
  it("lists not linked to a company: pick the right one, name the new one, Link all sends every decision", async () => {
    linkRows = true;
    mount(<PerfumeSupplierProfilesPanel />, "/perfume?tab=suppliers");
    const review = await screen.findByTestId("perfume-vendor-link-review");
    expect(review.textContent).toContain("Pick one");
    fireEvent.change(within(review).getByTestId("perfume-vendor-link-pick-vA"), { target: { value: "co8" } });
    fireEvent.change(within(review).getByTestId("perfume-vendor-link-name-vN"), { target: { value: "Nobody Fragrance House" } });
    fireEvent.click(within(review).getByTestId("perfume-vendor-link-apply"));
    await waitFor(() => expect(calls).toContainEqual(["/api/v1/perfume/vendor-links/apply", { decisions: [
      { vendor_id: "vA", company_id: "co8" }, { vendor_id: "vN", create_name: "Nobody Fragrance House" }] }]));
    await waitFor(() => expect(screen.queryByTestId("perfume-vendor-link-review")).toBeNull());
  });
  it("clicking a supplier in the list opens its profile in place of the list, at the top; All suppliers goes back", async () => {
    mount(<PerfumeSupplierProfilesPanel />, "/perfume?tab=suppliers");
    fireEvent.click(await screen.findByText("Vendor A"));
    const p = await screen.findByTestId("perfume-vendor-profile");
    await waitFor(() => expect(within(p).getByTestId("perfume-vendor-company").textContent).toContain("Miami"));
    expect(screen.queryByTestId("perfume-suppliers-search")).toBeNull();
    expect(screen.getByTestId("where").textContent).toContain("open=vA");
    fireEvent.click(screen.getByTestId("perfume-suppliers-back"));
    await screen.findByTestId("perfume-suppliers-search");
    expect(screen.getByTestId("where").textContent).not.toContain("open=");
  });
  it("an unlinked supplier offers its same-name Contacts company; one click links it and the profile shows it", async () => {
    mount(<PerfumeSupplierProfilesPanel />, "/perfume?tab=suppliers&open=vB");
    const btn = await screen.findByTestId("perfume-vendor-suggest-co7");
    expect(btn.textContent).toContain("Vendor B Inc");
    fireEvent.click(btn);
    await waitFor(() => expect(calls).toContainEqual(["/api/v1/perfume/vendors/vB/company", { company_id: "co7" }]));
    await waitFor(() => expect(screen.getByTestId("perfume-vendor-company").textContent).toContain("Doral"));
    expect(screen.queryByTestId("perfume-vendor-suggestions")).toBeNull();
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
