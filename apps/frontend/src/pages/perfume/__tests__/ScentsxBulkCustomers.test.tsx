import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as clientApi from "../../../api/client";
import { ToastProvider } from "../../../components/Toast";
import { BulkMakeScentsxCustomerCard } from "../PerfumeContactsPanel";

vi.mock("../../../api/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../../api/client")>()), apiRequest: vi.fn() }));

// ROUND L.31 M18 E2 — bulk Make ScentsX customer: confirm, the same two canonical calls per company, an existing same-name customer
// linked (not duplicated), a refusal listed (never silent).
const posts: Array<[string, unknown]> = [];
beforeEach(() => {
  posts.length = 0;
  vi.mocked(clientApi.apiRequest).mockImplementation(async (path: string, opts?: { method?: string; body?: unknown }) => {
    if (path === "/api/v1/scentsx/company") return { company: { id: "sx1", code: "SCENTSX", legal_name: "ScentsX LLC" } };
    if (path.startsWith("/api/v1/scentsx/customer-links/eligible")) return { total: 3, contacts: [
      { id: "cc1", name: "Casa Edith", email: "edith@example.com", phone: null },
      { id: "cc2", name: "Galaxy Conection", email: "g@example.com", phone: "956-555-0100" },
      { id: "cc3", name: "Bad Email Co", email: "x", phone: null }] };
    if (path === "/api/v1/mdata/customers" && opts?.method === "POST") {
      posts.push([path, opts.body]);
      const name = (opts.body as { legal_name: string }).legal_name;
      if (name === "Galaxy Conection") throw new clientApi.ApiError(409, { error: "mdata_customer_name_conflict" });
      if (name === "Bad Email Co") throw new clientApi.ApiError(400, { error: "invalid_email", message: "email is invalid" });
      return { id: `new-${name}` };
    }
    if (path.startsWith("/api/v1/mdata/customers?")) return { customers: [{ id: "existing-galaxy", name: "Galaxy Conection" }] };
    if (path === "/api/v1/scentsx/customer-links" && opts?.method === "POST") { posts.push([path, opts.body]); return { link: { id: "l" } }; }
    throw new Error(`unexpected ${path}`);
  });
});

describe("bulk Make ScentsX customer", () => {
  it("confirms, creates + links, links an existing same-name customer, lists the refusal", async () => {
    render(<MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider>
      <BulkMakeScentsxCustomerCard onDone={() => undefined} /></ToastProvider></QueryClientProvider></MemoryRouter>);
    const open = await screen.findByTestId("perfume-bulk-scentsx-open");
    await waitFor(() => expect((open as HTMLButtonElement).disabled).toBe(false));
    expect(posts).toEqual([]);
    fireEvent.click(open);
    fireEvent.click(await screen.findByTestId("perfume-bulk-scentsx-apply"));
    await waitFor(() => expect(screen.getByTestId("perfume-bulk-scentsx-summary").textContent).toMatch(/^2 done · 1 not done · 0 left/));
    expect(posts).toEqual([
      ["/api/v1/mdata/customers", { operating_company_id: "sx1", legal_name: "Casa Edith", email: "edith@example.com", customer_type: "direct" }],
      ["/api/v1/scentsx/customer-links", { desk_id: "cc1", engine_id: "new-Casa Edith" }],
      ["/api/v1/mdata/customers", { operating_company_id: "sx1", legal_name: "Galaxy Conection", email: "g@example.com", phone: "956-555-0100", customer_type: "direct" }],
      ["/api/v1/scentsx/customer-links", { desk_id: "cc2", engine_id: "existing-galaxy" }],
      ["/api/v1/mdata/customers", { operating_company_id: "sx1", legal_name: "Bad Email Co", email: "x", customer_type: "direct" }],
    ]);
    expect(screen.getByText("Linked to the existing customer")).toBeTruthy();
    expect(screen.getByText("NOT done")).toBeTruthy();
  });
});
