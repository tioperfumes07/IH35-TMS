import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import * as clientApi from "../../../api/client";
import { ToastProvider } from "../../../components/Toast";
import { PerfumeReviewPanel } from "../PerfumeReviewPanel";

vi.mock("../../../api/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../../api/client")>()), apiRequest: vi.fn() }));

const row = (id: string, desc: string) => ({
  id, list_id: "l1", vendor_id: "v1", vendor_name: "PCA", row_no: 1, upc: null, sku: null, brand: null, description: desc, price_cents: 1000,
  match_status: "review", suggestions: [{ item_id: "it-1", display_name: "ARMAF CLUB EDP 105ml", score: 0.95, why: "" }],
});

// Owner 2026-11-15 16:44 CT: "make it faster, when i click on a suggestion … it takes a very long time." The line
// leaves the list and the toast shows as soon as the confirm answers — not after every perfume view has reloaded.
describe("Perfume Review: Use suggestion settles the line at once", () => {
  it("the confirmed line disappears while the reload is still running", async () => {
    let reviewCalls = 0;
    let releaseReload: (() => void) | null = null;
    vi.mocked(clientApi.apiRequest).mockImplementation(async (path: string) => {
      if (path.startsWith("/api/v1/perfume/lists")) return { lists: [] };
      if (path.startsWith("/api/v1/perfume/rows/r1/confirm")) return { item_id: "it-1", rows_linked: 1 };
      if (path.startsWith("/api/v1/perfume/review")) {
        reviewCalls += 1;
        if (reviewCalls === 1) return { rows: [row("r1", "ARMAF CLUB 105"), row("r2", "ARMAF ODYSSEY 100")], total: 2 };
        // The reload hangs (the slow server) until the test lets it go.
        await new Promise<void>((res) => { releaseReload = res; });
        return { rows: [row("r2", "ARMAF ODYSSEY 100")], total: 1 };
      }
      throw new Error(`unexpected ${path}`);
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><ToastProvider><MemoryRouter><PerfumeReviewPanel /></MemoryRouter></ToastProvider></QueryClientProvider>);
    expect(await screen.findByText("ARMAF CLUB 105")).toBeTruthy();
    fireEvent.click(screen.getAllByTestId("perfume-review-use-suggestion")[0]);
    await waitFor(() => expect(screen.queryByText("ARMAF CLUB 105")).toBeNull());
    expect(screen.getByText("ARMAF ODYSSEY 100")).toBeTruthy();
    expect(await screen.findByText(/Linked 1 line/)).toBeTruthy();
    expect(releaseReload).not.toBeNull(); // the reload was still pending when the line left
    releaseReload!();
  });
});
