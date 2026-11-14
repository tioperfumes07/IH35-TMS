import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import * as clientApi from "../../../api/client";
import { ToastProvider } from "../../../components/Toast";
import PerfumeDeskPage from "../PerfumeDeskPage";

vi.mock("../../../auth/useAuth", () => ({ useAuth: () => ({ user: { uuid: "u", role: "Owner" } }) }));
vi.mock("../../../api/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../../api/client")>()), apiRequest: vi.fn() }));
const cols = [
  { key: "a:name", label: "Description", group: "PRODUCT DETAILS", kind: "text" },
  { key: "a:match", label: "Match", group: "MATCH", kind: "text" },
  { key: "a:cand", label: "Link to", group: "MATCH", kind: "text" },
  { key: "a:last_cost", label: "Last cost", group: "Purchases", kind: "money" },
  { key: "a:offer", label: "OFFER PRICE", group: "SALES", kind: "money" },
  { key: "a:esp", label: "Esperanza Price", group: "SALES", kind: "money" },
  { key: "a:over_by", label: "More Expensive By", group: "Analysis", kind: "money" },
];
// One line of mine with its item and no competitor line; one competitor line not on my list.
const MINE = { cols, rows: [{ id: "m:L1", "a:name": "CIELO BLUE", "a:match": "No competitor line linked", matched: 0, link_mode: "line", link_row: "L1", link_item: "I1", "a:offer": 2050, "a:esp": 2000, "a:over_by": -50,
  cand: [{ row_id: "C9", item_id: "I1", label: "CIELO BLUE 3.3 · ESPERANZA", price_cents: 450, why: "brand on the line" }] }], total: 582, facets: {}, rules: {}, vendors: [], measured_at: "x" };

describe("List analysis — my list | their list, matched filter, the match box, Excel (owner 2026-11-14)", () => {
  it("asks for my list / their list and all / matched / not matched; the match box links a suggestion, a searched line, and the empty columns toggle", async () => {
    const paths: Array<{ path: string; method?: string }> = [];
    vi.mocked(clientApi.apiRequest).mockImplementation(async (path: string, init?: { method?: string }) => {
      paths.push({ path, method: init?.method });
      if (path === "/api/v1/perfume/access") return { allowed: true };
      if (path.startsWith("/api/v1/perfume/review")) return { rows: [], total: 0 };
      if (path.startsWith("/api/v1/perfume/grid")) return MINE;
      if (path.startsWith("/api/v1/perfume/lines/search")) return { lines: [{ row_id: "C7", description: "CIELO BLUE EDT 100ML", vendor: "ESPERANZA", price_cents: 475, linked_to: null }] };
      if (path.includes("/confirm")) return { rows_linked: 1 };
      throw new Error(`unexpected ${path}`);
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><ToastProvider><MemoryRouter initialEntries={["/perfume?tab=analysis"]}><PerfumeDeskPage /></MemoryRouter></ToastProvider></QueryClientProvider>);
    await waitFor(() => expect(paths.some((p) => p.path.includes("view=analysis") && p.path.includes("base=mine") && p.path.includes("match=all"))).toBe(true));
    expect(await screen.findByText("582 lines · page 1 of 3", { exact: false })).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Their list", { exact: false }));
    await waitFor(() => expect(paths.some((p) => p.path.includes("base=theirs"))).toBe(true));
    fireEvent.click(screen.getByLabelText("Not matched", { exact: false }));
    await waitFor(() => expect(paths.some((p) => p.path.includes("base=theirs") && p.path.includes("match=unmatched"))).toBe(true));
    fireEvent.click(screen.getByLabelText("My list", { exact: false }));

    // One click on the suggestion links competitor line C9 to my item I1.
    const box = (await screen.findAllByTestId("perfume-analysis-matchbox"))[0]!;
    fireEvent.click(within(box).getByRole("button", { name: /Use suggestion/ }));
    await waitFor(() => expect(paths.some((p) => p.path === "/api/v1/perfume/rows/C9/confirm")).toBe(true));

    // Search any competitor line and confirm it.
    const input = within(box).getByRole("combobox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "cielo edt" } });
    await waitFor(() => expect(paths.some((p) => p.path === "/api/v1/perfume/lines/search?q=cielo%20edt")).toBe(true));
    fireEvent.click(await screen.findByText("CIELO BLUE EDT 100ML · ESPERANZA"));
    fireEvent.click(within(box).getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(paths.some((p) => p.path === "/api/v1/perfume/rows/C7/confirm")).toBe(true));

    // The lower of my offer and their price is shaded — that box only; more expensive by is negative.
    const low = screen.getAllByTestId("perfume-analysis-lowest");
    expect(low.map((e) => e.textContent)).toEqual(["$20.00"]);
    expect(screen.getByText("−$0.50")).toBeTruthy();

    // Purchase / cost columns hidden by default (no data uploaded); one click shows them.
    expect(screen.queryByRole("columnheader", { name: /Last cost/ })).toBeNull();
    fireEvent.click(screen.getByTestId("perfume-analysis-empty-toggle"));
    expect(await screen.findByRole("columnheader", { name: /Last cost/ })).toBeTruthy();
  });
  it("Match my list ↔ competitor is the same lines in the matching format, opening on Not matched", async () => {
    const paths: string[] = [];
    vi.mocked(clientApi.apiRequest).mockImplementation(async (path: string) => {
      paths.push(path);
      if (path === "/api/v1/perfume/access") return { allowed: true };
      if (path.startsWith("/api/v1/perfume/review")) return { rows: [], total: 0 };
      if (path.startsWith("/api/v1/perfume/grid")) return MINE;
      throw new Error(`unexpected ${path}`);
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><ToastProvider><MemoryRouter initialEntries={["/perfume?tab=match"]}><PerfumeDeskPage /></MemoryRouter></ToastProvider></QueryClientProvider>);
    await waitFor(() => expect(paths.some((p) => p.includes("view=analysis") && p.includes("base=mine") && p.includes("match=unmatched"))).toBe(true));
    expect(await screen.findAllByTestId("perfume-analysis-matchbox")).toHaveLength(1);
    // Matching columns only: no purchase / cost / analysis money columns.
    expect(screen.queryByRole("columnheader", { name: /Last cost/ })).toBeNull();
    expect(screen.queryByRole("columnheader", { name: /More Expensive By/ })).toBeNull();
  });
});
