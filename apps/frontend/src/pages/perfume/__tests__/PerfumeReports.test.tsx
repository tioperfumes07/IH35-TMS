import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as clientApi from "../../../api/client";
import { ToastProvider } from "../../../components/Toast";
import { PerfumeFamilyReportPanel, PerfumeInventoryStatusPanel, PerfumeItemInquiryPanel, PerfumePriceBookPanel, PerfumeSalesInquiryPanel } from "../PerfumeReportsPanel";
import { PERFUME_MODULES } from "../perfumeModules";

vi.mock("../../../api/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../../api/client")>()), apiRequest: vi.fn() }));

// LEAD ROUND L.20 items 2–6 (owner 2026-11-27 13:50 CT, CONTROL parity): Items inquiry, Sales inquiry, Price book, Inventory status, Product families.
const paths: string[] = [];
beforeEach(() => {
  paths.length = 0;
  vi.mocked(clientApi.apiRequest).mockImplementation(async (path: string) => {
    paths.push(path);
    if (path.startsWith("/api/v1/perfume/reports/item-inquiry/i1")) return {
      item: { id: "i1", display_name: "ZZ · ONE · 100 ml", tio_code: "T-1", pos_code: "P1", ticket_description: "ZZ ONE", sold_by: "pack", units_per_pack: 12, is_stock_item: true, is_active: true,
        price_locked: true, family: "ZZ Family", product_type: "Perfume", preferred_vendor: "PCA" },
      codes: { tio_code: "T-1", pos_code: "P1", upcs: ["12345678901"], hk_codes: ["108092"] },
      prices: [{ level_id: "l1", level: "Retail", price_cents: 4999, how: "fixed" }, { level_id: "l2", level: "Wholesale", price_cents: null, how: null }],
      special_price_cents: 3000, min_price_cents: 2500, best_supplier_cents: 1200, avg_cost_cents: 1300, avg_cost_source: "stock", last_cost_cents: 1500, last_cost_source: "last_receipt",
      last_receipt_at: "2026-11-20 10:00:00-06", on_hand: 10, inventory_value_cents: 13000, stock: [{ location_code: "LRD", site: "Laredo", qty: 10, avg_cost_cents: 1300, value_cents: 13000 }] };
    if (path === "/api/v1/perfume/price-levels") return { levels: [{ id: "l1", name: "Retail", active: true }, { id: "l9", name: "Old", active: false }] };
    if (path.startsWith("/api/v1/perfume/reports/price-book")) return { level: { id: "l1", name: "Retail" }, total: { items: 1, priced: 1 }, truncated: false,
      rows: [{ id: "i1", tio_code: "T-1", pos_code: "P1", upc: "12345678901", display_name: "ZZ · ONE · 100 ml", family: "ZZ Family", size_ml: 100, on_hand: 10, price_cents: 4999, special_price_cents: 3000, min_price_cents: 2500 }] };
    if (path.startsWith("/api/v1/perfume/reports/inventory-status")) return { total: { items: 1, on_hand: 10, value_cents: 13000 }, truncated: false,
      rows: [{ id: "i1", tio_code: "T-1", pos_code: "P1", display_name: "ZZ · ONE · 100 ml", family: "ZZ Family", on_hand: 10, avg_cost_cents: 1300, value_cents: 13000 }] };
    if (path.startsWith("/api/v1/perfume/reports/families")) return { total: { families: 1, items: 2, items_on_hand: 1, on_hand: 10, value_cents: 13000 },
      rows: [{ family_id: "f1", family: "ZZ Family", brand: "ZZ", items: 2, items_on_hand: 1, on_hand: 10, value_cents: 13000 }] };
    if (path === "/api/v1/scentsx/inquiry/customers") return { customers: [{ customer_id: "c1", customer: "Buyer One", invoices: 1 }] };
    if (path.startsWith("/api/v1/scentsx/inquiry/sales-invoices")) return { from: "2026-11-01", to: "2026-11-27", truncated: false,
      total: { invoices: 1, units: 11, sales_cents: 26000, tax_cents: 0, total_cents: 26000 },
      rows: [{ invoice_id: "inv1", invoice: "INV-0001", issue_date: "2026-11-20", customer_id: "c1", customer: "Buyer One", status: "sent", lines: 2, units: 11, sales_cents: 26000, tax_cents: 0, total_cents: 26000 }] };
    if (path.startsWith("/api/v1/scentsx/inquiry/sales-lines")) return { from: "2026-11-01", to: "2026-11-27", truncated: false, total: { lines: 1, invoices: 1, qty: 10, amount_cents: 25000 },
      rows: [{ invoice_line_id: "x1", invoice_id: "inv1", invoice: "INV-0001", issue_date: "2026-11-20", customer_id: "c1", customer: "Buyer One", item_id: "i1", item: "ZZ · ONE · 100 ml", description: null, qty: 10, unit_price_cents: 2500, amount_cents: 25000 }] };
    if (path.startsWith("/api/v1/perfume/families")) return { families: [] };
    return {};
  });
});
const mount = (ui: React.ReactNode) => render(<MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider>{ui}</ToastProvider></QueryClientProvider></MemoryRouter>);

describe("inquiry & reports", () => {
  it("is a module in the Perfume menu with the five screens", () => {
    expect(PERFUME_MODULES.find((m) => m.id === "reports")?.tabs).toEqual(["iteminquiry", "salesinquiry", "pricebook", "invstatus", "famreport", "vendortiers"]);
  });
  it("items inquiry: codes on one card, every level price, special / minimum, costs and stock on the other", async () => {
    mount(<PerfumeItemInquiryPanel initialId="i1" />);
    const codes = await screen.findByTestId("perfume-inquiry-codes");
    for (const t of ["T-1", "P1", "12345678901", "108092", "ZZ ONE", "Pack of 12", "PCA"]) expect(within(codes).getByText(t)).toBeTruthy();
    const prices = screen.getByTestId("perfume-inquiry-prices");
    expect(prices.textContent).toContain("Retail$49.99");
    expect(prices.textContent).toContain("Minimum price$25.00");
    expect(prices.textContent).toContain("Last cost$15.00");
    expect(screen.getByTestId("perfume-inquiry-kpis").textContent).toContain("$130.00");
  });
  it("price book: active levels only, rows at the level's price, Excel and PDF", async () => {
    mount(<PerfumePriceBookPanel />);
    await screen.findByText("ZZ · ONE · 100 ml");
    const lv = screen.getByTestId("perfume-price-book-level") as HTMLSelectElement;
    expect([...lv.options].map((o) => o.textContent)).toEqual(["Retail"]);
    expect(paths.some((p) => p.startsWith("/api/v1/perfume/reports/price-book?") && p.includes("level_id=l1") && p.includes("zero=N"))).toBe(true);
    fireEvent.change(screen.getByTestId("perfume-price-book-filter-zero"), { target: { value: "Y" } });
    await waitFor(() => expect(paths.some((p) => p.includes("zero=Y"))).toBe(true));
    expect(screen.getByTestId("perfume-price-book-pdf")).toBeTruthy();
  });
  it("inventory status and the family report carry their totals", async () => {
    mount(<><PerfumeInventoryStatusPanel /><PerfumeFamilyReportPanel /></>);
    await waitFor(() => expect(screen.getByTestId("perfume-inventory-status-total").textContent).toContain("$130.00"));
    expect(screen.getByTestId("perfume-family-report-kpis").textContent).toContain("1");
    expect(screen.getAllByText("ZZ Family").length).toBeGreaterThan(0);
  });
  it("sales inquiry by customer lists invoices and drills into an invoice's lines", async () => {
    mount(<PerfumeSalesInquiryPanel />);
    fireEvent.change(screen.getByTestId("perfume-sales-inquiry-mode"), { target: { value: "customer" } });
    fireEvent.click(await screen.findByTestId("perfume-sales-inquiry-open-inv1"));
    await waitFor(() => expect(paths.some((p) => p.startsWith("/api/v1/scentsx/inquiry/sales-lines") && p.includes("invoice_id=inv1"))).toBe(true));
    expect((await screen.findAllByText("ZZ · ONE · 100 ml")).length).toBeGreaterThan(0);
  });
});
