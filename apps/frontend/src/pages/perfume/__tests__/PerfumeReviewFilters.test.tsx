import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import * as clientApi from "../../../api/client";
import { ToastProvider } from "../../../components/Toast";
import { PerfumeReviewPanel } from "../PerfumeReviewPanel";

vi.mock("../../../api/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../../api/client")>()), apiRequest: vi.fn() }));

// Owner 2026-11-15 16:31 CT: "i need to filter by men or women, or by gender or by type, or set or tester or those with
// suggestions, etc, i need filters."
describe("Perfume Review: line filters (gender, set / tester, type, category, brand)", () => {
  it("lists the choices found on the waiting lines with their counts, and a pick goes to the server", async () => {
    const paths: string[] = [];
    vi.mocked(clientApi.apiRequest).mockImplementation(async (path: string) => {
      paths.push(path);
      if (path.startsWith("/api/v1/perfume/lists")) return { lists: [] };
      if (path.startsWith("/api/v1/perfume/review")) {
        return {
          rows: [], total: path.includes("gender=W") ? 2 : 5,
          facets: {
            gender: [{ value: "W", count: 2 }, { value: "M", count: 3 }],
            kind: [{ value: "NONE", count: 4 }, { value: "TESTER", count: 1 }],
            conc: [{ value: "EDP", count: 5 }], category: [{ value: "Women", count: 2 }], brand: [{ value: "ARMAF", count: 5 }],
          },
        };
      }
      throw new Error(`unexpected ${path}`);
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><ToastProvider><MemoryRouter><PerfumeReviewPanel /></MemoryRouter></ToastProvider></QueryClientProvider>);
    const gender = await screen.findByTestId("perfume-review-filter-gender");
    fireEvent.click(within(gender).getAllByRole("button")[0]);
    fireEvent.click(await within(gender).findByRole("button", { name: /Women \(2\)/ }));
    await waitFor(() => expect(paths.some((p) => p.startsWith("/api/v1/perfume/review") && p.includes("gender=W"))).toBe(true));
    const kind = screen.getByTestId("perfume-review-filter-kind");
    fireEvent.click(within(kind).getAllByRole("button")[0]);
    expect(await within(kind).findByRole("button", { name: /Tester \(1\)/ })).toBeTruthy();
    expect(within(kind).getByRole("button", { name: /Regular bottle \(4\)/ })).toBeTruthy();
    expect(screen.getByTestId("perfume-review-clear-filters").textContent).toContain("(1)");
  });
});
