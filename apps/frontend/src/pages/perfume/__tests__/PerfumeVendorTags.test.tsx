import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as clientApi from "../../../api/client";
import { ToastProvider } from "../../../components/Toast";
import { RoleToggles } from "../PerfumeListsPanel";
import type { PerfumeVendor } from "../../../api/perfume";

vi.mock("../../../api/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../../api/client")>()), apiRequest: vi.fn() }));

// Owner 2026-11-25 23:41 CT: "I'll tag or categorize vendors as vendors only trading distributors and customer as well etc".
const DARIELLE = { id: "v-dar", name: "Darielle", short_name: "DARIELLE", kind: "buy", roles: ["purchase", "trading"] } as unknown as PerfumeVendor;
const posts: Array<[string, unknown]> = [];
beforeEach(() => {
  posts.length = 0;
  vi.mocked(clientApi.apiRequest).mockImplementation(async (path: string, opts?: { method?: string; body?: unknown }) => {
    if (opts?.method === "POST" || opts?.method === "PATCH" || opts?.method === "PUT") posts.push([path, opts.body]);
    return { ok: true, id: "v-dar" };
  });
});
const mount = (v: PerfumeVendor) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider><RoleToggles vendor={v} /></ToastProvider></QueryClientProvider>);

describe("vendor tags on the vendor's row", () => {
  it("Purchase · Trading · Wholesale · Distributor · Customer — the owner's two tags sit after the tab roles", () => {
    mount(DARIELLE);
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Purchase", "Trading", "Wholesale", "Distributor", "Customer"]);
    expect(screen.getByTestId("perfume-vendor-row-role-customer").getAttribute("aria-pressed")).toBe("false");
  });
  it("Customer is saved on the vendor at once, keeping its other roles (Darielle: buyer and supplier)", async () => {
    mount(DARIELLE);
    fireEvent.click(screen.getByTestId("perfume-vendor-row-role-customer"));
    await waitFor(() => expect(posts.length).toBe(1));
    expect((posts[0][1] as { roles: string[] }).roles).toEqual(["purchase", "trading", "customer"]);
  });
});
