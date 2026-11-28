/** Concentration check: lists what the lists say; ticked rows get their agreed concentration through the item file bulk edit. */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import * as clientApi from "../../../api/client";
import { ToastProvider } from "../../../components/Toast";
import { PerfumeConcCheck } from "../PerfumeConcCheck";

vi.mock("../../../api/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../../api/client")>()), apiRequest: vi.fn() }));

const data = { total: 2, counts: { proposed: 1, conflict: 1, none: 0 }, limit: 200, offset: 0, rows: [
  { id: "t1", display_name: "DAVIDOFF · COOLWATER NIGHTDIVE · 125 ml · TESTER", product_type: "Tester", size_ml: 125, status: "proposed", proposed: "EDT", concs: "EDT", agree_n: 3, items_n: 1, lines_n: 2, evidence: ["DAVIDOFF · COOL WATER NIGHT DIVE · 125 ml · EDT · Men"] },
  { id: "s1", display_name: "PACO RABANNE · 1 MILLION 3PCS SET", product_type: "Set", size_ml: 100, status: "conflict", proposed: null, concs: "EDT / PARFUM", agree_n: 2, items_n: 2, lines_n: 0, evidence: [] },
] };

describe("PerfumeConcCheck", () => {
  it("shows the lists' answer and sets the ticked one's concentration", async () => {
    const api = vi.mocked(clientApi.apiRequest);
    api.mockImplementation(async (url: string) => (url.includes("item-file-bulk") ? { updated: 1 } : data) as never);
    render(<ToastProvider><QueryClientProvider client={new QueryClient()}><PerfumeConcCheck /></QueryClientProvider></ToastProvider>);
    await waitFor(() => expect(screen.getByText("Disagree: EDT / PARFUM")).toBeTruthy());
    expect(screen.getByTestId("perfume-conc-count").textContent).toContain("lists agree on 1");
    const box = screen.getByTestId("perfume-conc-check");
    fireEvent.click(within(box).getAllByRole("checkbox")[1]!);
    fireEvent.click(await screen.findByTestId("perfume-conc-apply"));
    await waitFor(() => expect(api).toHaveBeenCalledWith("/api/v1/perfume/item-file-bulk", { method: "POST", body: { ids: ["t1"], set: { conc: "EDT" } } }));
  });
});
