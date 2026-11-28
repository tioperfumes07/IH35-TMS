/** M21: Items → books lists each item's accounts, makes ticked items ScentsX items, and "all matching" loops until none is left. */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import * as clientApi from "../../../api/client";
import { ToastProvider } from "../../../components/Toast";
import { ScentsxItemBooks } from "../ScentsxItemBooks";

vi.mock("../../../api/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../../api/client")>()), apiRequest: vi.fn() }));

const books = { total: 2, linked: 0, limit: 100, offset: 0, income_accounts: [{ number: "4000", name: "Sales of Goods - Wholesale" }],
  rows: [
    { id: "i1", display_name: "ZZ · ALPHA", category: "Perfume", conc: "EDP", accounts_from: "category", inventory_account: "1201 Inventory - Perfume", cogs_account: "5001 Cost of Goods Sold - Perfume", catalog_item_id: null, catalog_item_name: null },
    { id: "i2", display_name: "ZZ · BETA", category: null, conc: "EDT", accounts_from: "role", inventory_account: "1200 Inventory", cogs_account: "5000 Cost of Goods Sold", catalog_item_id: null, catalog_item_name: null },
  ] };

describe("ScentsxItemBooks", () => {
  it("shows accounts and makes all matching in 500-row passes until none is left", async () => {
    const api = vi.mocked(clientApi.apiRequest);
    let pass = 0;
    api.mockImplementation(async (url: string) => {
      if (url.startsWith("/api/v1/scentsx/item-books/make-items")) { pass++; return { created: pass === 1 ? 500 : 12, already_linked: 0, not_stock_items: 0, remaining: pass === 1 ? 12 : 0, made: [] } as never; }
      if (url.startsWith("/api/v1/scentsx/item-books")) return books as never;
      return { kinds: [{ kind: "item_category", label: "Category", values: [{ id: "c1", value: "Perfume", sort: 1, contacts: 0 }] }] } as never;
    });
    render(<MemoryRouter><ToastProvider><QueryClientProvider client={new QueryClient()}><ScentsxItemBooks /></QueryClientProvider></ToastProvider></MemoryRouter>);
    await waitFor(() => expect(screen.getByText("1201 Inventory - Perfume")).toBeTruthy());
    expect(screen.getByText("Default (no category)")).toBeTruthy();
    expect(screen.getByTestId("scentsx-item-books-count").textContent).toContain("2 items match");
    fireEvent.click(screen.getByTestId("scentsx-item-books-make-all"));
    await waitFor(() => expect(pass).toBe(2));
    expect(api).toHaveBeenCalledWith("/api/v1/scentsx/item-books/make-items", { method: "POST", body: { filter: { linked: "no" }, max: 500 } });
  });
});
