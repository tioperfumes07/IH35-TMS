import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import * as clientApi from "../../../api/client";
import { ToastProvider } from "../../../components/Toast";
import PerfumeDeskPage from "../PerfumeDeskPage";

vi.mock("../../../auth/useAuth", () => ({ useAuth: () => ({ user: { uuid: "u", role: "Owner" } }) }));
vi.mock("../../../api/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../../api/client")>()), apiRequest: vi.fn() }));

const DATA = { total_mine: 463, linked: 95, unlinked: 368, rows: [
  { item_id: "11111111-1111-4111-8111-111111111111", display_name: "ARMAF · CLUB NUIT INTENSE · 105 ml · EDT · Men", my_desc: "CLUB DE NUIT INTENSE MAN EDT 105ML", my_price_cents: 2250,
    candidates: [{ row_id: "22222222-2222-4222-8222-222222222222", vendor: "ESPERANZA", description: "ARMAF CLUB DE NUIT INTENSE M EDT 3.6oz", price_cents: 2600, score: 1, why: "brand on the line · 3/3 name words", linked_to: null }] },
  { item_id: "33333333-3333-4333-8333-333333333333", display_name: "AFNAN · 9PM · 100 ml", my_desc: "AFNAN 9PM", my_price_cents: 1500, candidates: [] },
] };

describe("Match my list ↔ competitor (owner 2026-11-14)", () => {
  it("shows my wording beside theirs, the counts, and links a line only when Link is pressed", async () => {
    const calls: Array<[string, unknown]> = [];
    vi.mocked(clientApi.apiRequest).mockImplementation(async (path: string, init?: { method?: string; body?: unknown }) => {
      calls.push([path, init?.body]);
      if (path === "/api/v1/perfume/access") return { allowed: true };
      if (path.startsWith("/api/v1/perfume/review")) return { rows: [], total: 0 };
      if (path === "/api/v1/perfume/my-unlinked") return DATA;
      if (path.includes("/confirm")) return { item_id: "x", rows_linked: 1 };
      throw new Error(`unexpected ${path}`);
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><ToastProvider><MemoryRouter initialEntries={["/perfume?tab=match"]}><PerfumeDeskPage /></MemoryRouter></ToastProvider></QueryClientProvider>);
    expect(await screen.findByText("CLUB DE NUIT INTENSE MAN EDT 105ML")).toBeTruthy();
    expect(screen.getByText("ARMAF CLUB DE NUIT INTENSE M EDT 3.6oz")).toBeTruthy();
    expect(screen.getByTestId("perfume-match-counts").textContent).toContain("368 not linked");
    expect(screen.getByText("No competitor line looks like this item.")).toBeTruthy();
    expect(calls.some(([p]) => p.includes("/confirm"))).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: /Link ARMAF CLUB DE NUIT INTENSE/ }));
    await waitFor(() => expect(calls.some(([p, b]) => p === "/api/v1/perfume/rows/22222222-2222-4222-8222-222222222222/confirm" && (b as { item_id: string }).item_id === "11111111-1111-4111-8111-111111111111")).toBe(true));
  });
});
