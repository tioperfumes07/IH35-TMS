import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as clientApi from "../../../api/client";
import { ToastProvider } from "../../../components/Toast";
import { ScentsxBulkVendors } from "../ScentsxBulkVendors";
import type { PerfumeVendor } from "../../../api/perfume";

vi.mock("../../../api/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../../api/client")>()), apiRequest: vi.fn() }));

// ROUND L.31 M23 — bulk Make ScentsX vendor: the same two canonical calls as the one-at-a-time button, already-linked left alone,
// a name already on ScentsX's vendor list linked instead of duplicated, a sell-only supplier skipped.
const calls: Array<[string, unknown]> = [];
const sup = (id: string, name: string, kind = "buy") => ({ id, name, short_name: null, kind, roles: [], cushion_lo_cents: null, cushion_hi_cents: null, freight_lo_cents: null,
  freight_hi_cents: null, earn_pct: null, sells_by_box: false, contact: null, column_mapping: {} }) as unknown as PerfumeVendor;
beforeEach(() => {
  calls.length = 0;
  vi.mocked(clientApi.apiRequest).mockImplementation(async (path: string, opts?: { method?: string; body?: unknown }) => {
    calls.push([`${opts?.method ?? "GET"} ${path}`, opts?.body]);
    if (path === "/api/v1/scentsx/company") return { company: { id: "sx1", code: "SCENTSX", legal_name: "ScentsX LLC" } };
    if (path === "/api/v1/scentsx/vendor-links" && !opts?.method) return { links: [{ id: "l1", desk_id: "pv1", engine_id: "e1", engine_name: "Already", created_at: "", voided_at: null, void_reason: null }] };
    if (path === "/api/v1/mdata/vendors" && opts?.method === "POST") {
      const name = (opts.body as { name: string }).name;
      if (name === "B&S Fragrances") throw new clientApi.ApiError(409, { error: "mdata_vendor_name_conflict" });
      return { id: `new-${name}` };
    }
    if (path.startsWith("/api/v1/mdata/vendors?")) return { vendors: [{ id: "existing-bs", name: "B&S Fragrances", vendor_type: "Perfume supplier" }] };
    if (path === "/api/v1/scentsx/vendor-links" && opts?.method === "POST") return { link: { id: "lnew" }, screening: { result: "clear" } };
    throw new Error(`unexpected ${path}`);
  });
});

describe("bulk Make ScentsX vendor", () => {
  it("makes every buying supplier not yet linked, links an existing same-name vendor, leaves linked and sell-only ones alone", async () => {
    render(<MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider>
      <ScentsxBulkVendors selectedIds={[]} suppliers={[sup("pv1", "Already linked"), sup("pv2", "Jizan Perfumes"), sup("pv3", "B&S Fragrances"), sup("pv4", "A buyer only", "sell")]} />
    </ToastProvider></QueryClientProvider></MemoryRouter>);
    const btn = await screen.findByTestId("scentsx-bulk-vendors");
    await waitFor(() => expect(btn.textContent).toMatch(/\(2\)$/));
    fireEvent.click(btn);
    fireEvent.click(await screen.findByTestId("scentsx-bulk-vendors-go"));
    await waitFor(() => expect(screen.getByTestId("scentsx-bulk-vendors-summary").textContent).toMatch(/^2 done · 0 not done · 0 left/));
    const posts = calls.filter(([c]) => c.startsWith("POST"));
    expect(posts).toEqual([
      ["POST /api/v1/mdata/vendors", { operating_company_id: "sx1", name: "Jizan Perfumes", vendor_type: "Perfume supplier" }],
      ["POST /api/v1/scentsx/vendor-links", { desk_id: "pv2", engine_id: "new-Jizan Perfumes" }],
      ["POST /api/v1/mdata/vendors", { operating_company_id: "sx1", name: "B&S Fragrances", vendor_type: "Perfume supplier" }],
      ["POST /api/v1/scentsx/vendor-links", { desk_id: "pv3", engine_id: "existing-bs" }],
    ]);
    expect(screen.getByText("Linked to the existing vendor")).toBeTruthy();
  });
});
