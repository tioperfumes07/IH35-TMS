import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as clientApi from "../../../api/client";
import { ToastProvider } from "../../../components/Toast";
import { PerfumeSalespeoplePanel } from "../PerfumeSalespeoplePanel";

vi.mock("../../../api/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../../api/client")>()), apiRequest: vi.fn() }));

// ROUND L.31 M18 E3 — salespeople: report by salesperson with commission, drill to customers, assign customers in bulk, set the %.
const posts: Array<[string, string, unknown]> = [];
beforeEach(() => {
  posts.length = 0;
  vi.mocked(clientApi.apiRequest).mockImplementation(async (path: string, opts?: { method?: string; body?: unknown }) => {
    if (opts?.method) { posts.push([opts.method, path, opts.body]); return { id: "x", changed: 2, unchanged: 0 }; }
    if (path === "/api/v1/perfume/salespeople") return { salespeople: [{ id: "s1", name: "Sonia Pichardo", commission_pct: 5, active: true, notes: null, customers: 2, created_at: "" }] };
    if (path.startsWith("/api/v1/perfume/salespeople/report/customers?")) return { customers: [{ company_id: "c1", name: "Casa Edith", assigned_at: "2026-11-27T10:00:00Z", invoice_sales_cents: 0, history_sales_cents: 100000, sales_cents: 100000 }] };
    if (path.startsWith("/api/v1/perfume/salespeople/report?")) return { from: "2026-01-01", to: "2026-11-27", currency: "USD", attribution: "current", totals: { sales_cents: 125000, commission_cents: 5000 },
      rows: [{ salesperson_id: "s1", salesperson: "Sonia Pichardo", commission_pct: 5, customers: 2, buying_customers: 1, invoice_sales_cents: 0, history_sales_cents: 100000, sales_cents: 100000, commission_cents: 5000 },
        { salesperson_id: null, salesperson: "Unassigned", commission_pct: 0, customers: 1, buying_customers: 1, invoice_sales_cents: 0, history_sales_cents: 25000, sales_cents: 25000, commission_cents: 0 }] };
    if (path.startsWith("/api/v1/perfume/contacts?")) return { counts: {}, total: 2, limit: 200, offset: 0, rows: [{ id: "c1", name: "Casa Edith" }, { id: "c2", name: "Galaxy Conection" }] };
    throw new Error(`unexpected ${path}`);
  });
});
const mount = () => render(<MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider><PerfumeSalespeoplePanel /></ToastProvider></QueryClientProvider></MemoryRouter>);

describe("perfume salespeople", () => {
  it("sales & commission by salesperson, drill to customers, assign in bulk, edit the %", async () => {
    mount();
    expect((await screen.findAllByText("Sonia Pichardo")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("$50.00").length).toBeGreaterThan(0); // commission 5 % of $1,000.00
    expect(screen.getByText("Unassigned")).toBeTruthy();
    fireEvent.click(screen.getAllByText("Sonia Pichardo")[0]!);
    expect(await screen.findByText("Casa Edith")).toBeTruthy();
    fireEvent.click(screen.getByTestId("perfume-sp-assign"));
    fireEvent.change(await screen.findByTestId("perfume-sp-assign-find"), { target: { value: "ca" } });
    expect(await screen.findByText("Galaxy Conection")).toBeTruthy();
    const modal = await screen.findByTestId("perfume-sp-assign-modal");
    const all = Array.from(modal.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));
    fireEvent.click(all[0]!); // the modal table's select-all

    await waitFor(() => expect((screen.getByTestId("perfume-sp-assign-save") as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByTestId("perfume-sp-assign-save"));
    await waitFor(() => expect(posts).toContainEqual(["POST", "/api/v1/perfume/salespeople/assign", { company_ids: ["c1", "c2"], salesperson_id: "s1" }]));
    fireEvent.click(await screen.findByTestId("perfume-sp-edit-s1"));
    fireEvent.change(await screen.findByTestId("perfume-sp-pct"), { target: { value: "7.5" } });
    fireEvent.click(screen.getByTestId("perfume-sp-save"));
    await waitFor(() => expect(posts).toContainEqual(["PATCH", "/api/v1/perfume/salespeople/s1", { name: "Sonia Pichardo", commission_pct: 7.5, active: true }]));
  });
});
