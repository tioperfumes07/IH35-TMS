/** L.30 item 11: ticked desk rows → "Confirm prices into my list" asks once, then writes and shows the counts. */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import * as clientApi from "../../../api/client";
import { ConfirmPricesButton } from "../PerfumeConfirmPrices";

vi.mock("../../../api/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../../api/client")>()), apiRequest: vi.fn() }));

describe("ConfirmPricesButton", () => {
  it("asks, posts the ticked item ids with my margin, and shows what was written and what was skipped", async () => {
    const api = vi.mocked(clientApi.apiRequest);
    api.mockResolvedValue({ ok: true, updated: 2, unchanged: 1, not_on_my_list: ["c"], no_price: [], changes: [] });
    render(<QueryClientProvider client={new QueryClient()}><ConfirmPricesButton itemIds={["a", "b", "c", "d"]} targetPct={12} earnPct={null} /></QueryClientProvider>);
    fireEvent.click(screen.getByTestId("perfume-confirm-prices-open"));
    expect(api).not.toHaveBeenCalled();
    expect(screen.getByText(/for 4 item\(s\)\?/)).toBeTruthy();
    fireEvent.click(screen.getByTestId("perfume-confirm-prices-yes"));
    await waitFor(() => expect(screen.getByTestId("perfume-confirm-prices-result").textContent).toBe(
      "2 price(s) written · 1 already at that price · 1 not on my list · 0 without a calculated price"));
    expect(api).toHaveBeenCalledWith("/api/v1/perfume/mine/confirm-prices", { method: "POST", body: { item_ids: ["a", "b", "c", "d"], target_pct: 12, earn_pct: null } });
  });
});
