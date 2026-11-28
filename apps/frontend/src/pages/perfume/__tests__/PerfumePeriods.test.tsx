import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as clientApi from "../../../api/client";
import { ToastProvider } from "../../../components/Toast";
import { PerfumePeriodsPanel } from "../PerfumePeriodsPanel";

vi.mock("../../../api/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../../api/client")>()), apiRequest: vi.fn() }));

// ROUND L.31 M17: ScentsX closing date on the one period engine — close in order, reopen the last closed with a reason.
const calls: Array<[string, unknown]> = [];
const per = (id: string, m: string, status: string) => ({ id, period_label: `2026-${m}`, period_start: `2026-${m}-01`, period_end: `2026-${m}-28`, fiscal_year: 2026, status, closed_at: status === "closed" ? "2026-11-27T10:00:00Z" : null, closing_journal_entry_id: null });
beforeEach(() => {
  calls.length = 0;
  vi.mocked(clientApi.apiRequest).mockImplementation(async (path: string, opts?: { method?: string; body?: unknown }) => {
    if (opts?.method) { calls.push([path, opts.body]); return { ok: true, retained_earnings_entry_id: null }; }
    if (path === "/api/v1/scentsx/company") return { company: { id: "sx1", code: "SCENTSX", legal_name: "ScentsX LLC" } };
    if (path.startsWith("/api/v1/accounting/periods?operating_company_id=sx1")) return { periods: [per("p12", "12", "open"), per("p11", "11", "open"), per("p10", "10", "closed")] };
    throw new Error(`unexpected ${path}`);
  });
});
const mount = () => render(<MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider><PerfumePeriodsPanel /></ToastProvider></QueryClientProvider></MemoryRouter>);

describe("ScentsX periods & closing date", () => {
  it("shows the closing date; only the earliest open month can close; close posts to the engine for ScentsX", async () => {
    mount();
    expect((await screen.findAllByText("10/28/2026")).length).toBeGreaterThan(1);
    expect(screen.queryByTestId("scentsx-pd-close-p12")).toBeNull();
    fireEvent.click(screen.getByTestId("scentsx-pd-close-p11"));
    fireEvent.click(await screen.findByTestId("scentsx-pd-confirm"));
    await waitFor(() => expect(calls).toContainEqual(["/api/v1/accounting/periods/p11/close", { operating_company_id: "sx1" }]));
  });
  it("reopen needs a reason and sends it", async () => {
    mount();
    fireEvent.click(await screen.findByTestId("scentsx-pd-reopen-p10"));
    const ok = await screen.findByTestId("scentsx-pd-confirm");
    expect((ok as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByTestId("scentsx-pd-text"), { target: { value: "Late vendor bill" } });
    fireEvent.click(ok);
    await waitFor(() => expect(calls).toContainEqual(["/api/v1/accounting/periods/p10/reopen", { operating_company_id: "sx1", reason: "Late vendor bill" }]));
  });
});
