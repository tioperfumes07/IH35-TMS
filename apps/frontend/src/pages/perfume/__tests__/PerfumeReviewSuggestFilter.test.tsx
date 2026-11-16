import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import * as clientApi from "../../../api/client";
import { ToastProvider } from "../../../components/Toast";
import { pickCombo } from "../../../test-utils/pickCombo";
import { PerfumeReviewPanel } from "../PerfumeReviewPanel";

vi.mock("../../../api/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../../api/client")>()), apiRequest: vi.fn() }));

// Owner 2026-11-15 19:24 CT: "the selector or filter for only those that have suggestions etc … 70 and up".
describe("Perfume Review: Suggestions filter", () => {
  it("lists has-a-suggestion / % alike / none with their counts, and a pick goes to the server", async () => {
    const paths: string[] = [];
    vi.mocked(clientApi.apiRequest).mockImplementation(async (path: string) => {
      paths.push(path);
      if (path.startsWith("/api/v1/perfume/lists")) return { lists: [] };
      if (path.startsWith("/api/v1/perfume/review")) {
        return {
          rows: [], total: 10,
          facets: { gender: [], conc: [], kind: [], category: [], brand: [],
            suggest: [{ value: "any", count: 7 }, { value: "95", count: 2 }, { value: "90", count: 3 }, { value: "80", count: 5 }, { value: "70", count: 6 }, { value: "none", count: 3 }] },
        };
      }
      throw new Error(`unexpected ${path}`);
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><ToastProvider><MemoryRouter><PerfumeReviewPanel /></MemoryRouter></ToastProvider></QueryClientProvider>);
    const combo = await screen.findByTestId("perfume-review-filter-suggest");
    await waitFor(() => expect(paths.some((p) => p.startsWith("/api/v1/perfume/review"))).toBe(true));
    pickCombo(combo, /Best 70% alike and up \(6\)/);
    await waitFor(() => expect(paths.some((p) => p.startsWith("/api/v1/perfume/review") && p.includes("suggest=70"))).toBe(true));
    expect(screen.getByTestId("perfume-review-clear-filters").textContent).toContain("(1)");
  });
});
