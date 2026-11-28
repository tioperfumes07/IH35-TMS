import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as clientApi from "../../../api/client";
import { ToastProvider } from "../../../components/Toast";
import { PerfumeAssetsPanel } from "../PerfumeAssetsPanel";

vi.mock("../../../api/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../../api/client")>()), apiRequest: vi.fn() }));

// ROUND L.31 M14: register a ScentsX fixed asset in its class through the one engine; post depreciation through the FIN-21 poster.
const calls: Array<[string, unknown]> = [];
const asset = { id: "fa1", asset_number: "SX-1", name: "Display wall", owner_operating_company_id: "sx1", owner_company_name: "ScentsX", is_owner_operated: true, class_id: "c1",
  class_name: "Store fixtures & displays", purchase_price_cents: 840000, salvage_value_cents: 0, purchase_date: "2026-11-01", in_service_date: "2026-11-15", method: "straight_line",
  useful_life_months: 84, convention: "full_month", status: "active", created_at: "2026-11-28", depreciation_to_date_cents: 0, net_book_value_cents: 840000 };
beforeEach(() => {
  calls.length = 0;
  vi.mocked(clientApi.apiRequest).mockImplementation(async (path: string, opts?: { method?: string; body?: unknown }) => {
    if (opts?.method) calls.push([path, opts.body]);
    if (path === "/api/v1/scentsx/company") return { company: { id: "sx1", code: "SCENTSX", legal_name: "ScentsX LLC" } };
    if (path.startsWith("/api/v1/accounting/fixed-assets?")) return { total: 1, limit: 200, offset: 0, items: [asset] };
    if (path.startsWith("/api/v1/accounting/fixed-asset-classes")) return { classes: [{ id: "c1", class_code: "STORE_FIXTURES", class_name: "Store fixtures & displays", default_useful_life_months: 84 }] };
    if (path === "/api/v1/accounting/fixed-assets/register") return { id: "fa2" };
    if (path.startsWith("/api/v1/accounting/amortization-posting/depreciation/post")) return { result: "posted" };
    throw new Error(`unexpected ${path}`);
  });
});
const mount = () => render(<MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider><PerfumeAssetsPanel /></ToastProvider></QueryClientProvider></MemoryRouter>);

describe("ScentsX fixed assets", () => {
  it("lists cost / book value; Post depreciation calls the poster for ScentsX; Register sends the class and cost", async () => {
    mount();
    expect(await screen.findByText("Display wall")).toBeTruthy();
    fireEvent.click(screen.getByTestId("scentsx-fa-post-fa1"));
    await waitFor(() => expect(calls.some(([p, b]) => p.includes("depreciation/post?operating_company_id=sx1") && (b as { asset_id: string }).asset_id === "fa1")).toBe(true));
    fireEvent.click(screen.getByTestId("scentsx-fa-new"));
    await screen.findByText(/Store fixtures & displays · 7 years/);
    fireEvent.change(screen.getByTestId("scentsx-fa-class"), { target: { value: "c1" } });
    fireEvent.change(screen.getByTestId("scentsx-fa-name"), { target: { value: "POS computer" } });
    const cost = screen.getByLabelText("Cost"); fireEvent.change(cost, { target: { value: "1200.00" } }); fireEvent.blur(cost);
    await waitFor(() => expect((screen.getByTestId("scentsx-fa-save") as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByTestId("scentsx-fa-save"));
    await waitFor(() => expect(calls).toContainEqual(["/api/v1/accounting/fixed-assets/register", expect.objectContaining({ operating_company_id: "sx1", class_id: "c1", name: "POS computer", purchase_price_cents: 120000 })]));
  });
});
