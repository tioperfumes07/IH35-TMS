import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as clientApi from "../../../api/client";
import { ToastProvider } from "../../../components/Toast";
import { PerfumeCampaignPanel } from "../PerfumeCampaignPanel";
import { PerfumeTradersPanel } from "../PerfumeTradersPanel";
import type { PerfumeTrade, PerfumeTraders } from "../../../api/perfume";

vi.mock("../../../api/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../../api/client")>()), apiRequest: vi.fn() }));

// Owner 2026-11-26 16:59 CT: "ok get this all completely done now" — design boards 4 (mass email campaign) and 3 (traders).
const calls: Array<[string, unknown]> = [];
const trade = (id: string, item: string, stage: PerfumeTrade["stage"]): PerfumeTrade => ({ id, item, brand: "Armani", upc: null, from_company_id: null, from_company: "PCA",
  buy_cents: 2850, sell_cents: 3200, qty: 120, stage, note: null, closed_on: null, created_at: "2026-11-26T00:00:00Z", updated_at: "2026-11-26T00:00:00Z", buyers: [] });
let traders: PerfumeTraders;
beforeEach(() => {
  calls.length = 0;
  traders = {
    kpis: { both: 204, both_with_email: 150, sent_lists: 80, exposed_lists: 3, common_buyers: 1, open_trades: 1, closed_trades: 0 },
    trades: [trade("t1", "Armani Code 4.2 oz", "offer_received")],
    common_buyers: [{ id: "c1", name: "Perfumeria Rosa", role: "customer", city: "Laredo", country: "US", lists: 2, senders: ["Pca", "Mtz"] }],
    exposed_lists: [{ sender: "Pca", buyers: 14, first_on: "2026-01-02", last_on: "2026-11-20" }],
    matrix_brands: ["ARMANI", "DIOR"],
    matrix: [{ vendor_id: "v1", vendor: "PCA", brands: { ARMANI: 31 }, carried: 1 }],
    brand_options: [{ brand: "ARMANI", vendors: 4 }, { brand: "DIOR", vendors: 3 }],
  };
  vi.mocked(clientApi.apiRequest).mockImplementation(async (path: string, opts?: { method?: string; body?: unknown }) => {
    if (opts?.method) calls.push([path, opts.body]);
    if (path === "/api/v1/perfume/campaigns" && !opts?.method) return { campaigns: [] };
    if (path === "/api/v1/perfume/segments" && !opts?.method) return { segments: [] };
    if (path === "/api/v1/perfume/campaigns/audience") return { companies: 2, people: 6, with_email: 4, phone_only: 1, opted_out: 1, invalid: 1, recipients: 2, en: 1, es: 1,
      sample: [{ email: "bob@ny.com", language: "en" }, { email: "ana@rosa.mx", language: "es" }] };
    if (path.startsWith("/api/v1/perfume/contacts?")) return { counts: {}, total: 0, limit: 1, offset: 0, rows: [], facets: { country: [{ value: "MX", count: 3 }], state: [], city: [], category: [], source: [], how: [] } };
    if (path === "/api/v1/perfume/campaigns") return { id: "k1" };
    if (path.startsWith("/api/v1/perfume/campaigns/k1")) return { campaign: { id: "k1", name: "Weekly", status: "draft", filters: {}, language: "auto", per_hour: 600, recipients: 0, sent: 0, skipped: 0, failed: 0 }, attachments: [], batches: [] };
    if (path.startsWith("/api/v1/perfume/traders")) return traders;
    if (path.endsWith("/stage")) return { ok: true };
    throw new Error(`unexpected ${path}`);
  });
});
const mount = (ui: React.ReactNode) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider>{ui}</ToastProvider></QueryClientProvider>);

describe("mass email campaign", () => {
  it("shows who it reaches — English and Spanish, phone-only and opted-out left out — and saves the draft", async () => {
    mount(<PerfumeCampaignPanel />);
    fireEvent.click(await screen.findByTestId("perfume-cmp-new"));
    const who = await screen.findByTestId("perfume-cmp-audience");
    await waitFor(() => expect(within(who).getAllByText("2").length).toBeGreaterThan(0));
    expect(within(who).getByText("Phone only (left out)")).toBeTruthy();
    expect(screen.getByText(/bob@ny.com \(EN\) · ana@rosa.mx \(ES\)/)).toBeTruthy();
    fireEvent.change(screen.getByTestId("perfume-cmp-name"), { target: { value: "Weekly" } });
    fireEvent.change(screen.getByTestId("perfume-cmp-subject-es"), { target: { value: "Oferta semanal" } });
    fireEvent.click(screen.getByTestId("perfume-cmp-save"));
    await waitFor(() => expect(calls.find(([p]) => p === "/api/v1/perfume/campaigns")?.[1]).toMatchObject({ name: "Weekly", subject_es: "Oferta semanal", language: "auto" }));
  });
});

describe("traders board", () => {
  it("puts each trade in its stage, moves it, and shows brands, common buyers and exposed lists", async () => {
    mount(<PerfumeTradersPanel />);
    const board = await screen.findByTestId("perfume-trd-stage-offer_received");
    await waitFor(() => expect(within(board).getByText("Armani Code 4.2 oz")).toBeTruthy());
    expect(within(board).getByText(/\$28.50 → \$32.00 · 10.9%/)).toBeTruthy();
    fireEvent.change(within(board).getByRole("combobox"), { target: { value: "offer_sent" } });
    await waitFor(() => expect(calls).toContainEqual(["/api/v1/perfume/trades/t1/stage", { stage: "offer_sent" }]));
    expect((await screen.findAllByText("Perfumeria Rosa")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("31").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Pca").length).toBeGreaterThan(0);
  });
});
