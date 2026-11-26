import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as clientApi from "../../../api/client";
import { ToastProvider } from "../../../components/Toast";
import { PerfumeContactsPanel } from "../PerfumeContactsPanel";
import type { PerfumeContactList, PerfumeGooglePlan } from "../../../api/perfume";

vi.mock("../../../api/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../../api/client")>()), apiRequest: vi.fn() }));

// Owner 2026-11-25 22:11 CT: "very important where or how the contact was imitated and where and dates … remember vendors can be
// customers as well" — 22:09 CT: Google full data. Research session ROUND P1.4 #5: the first batch is one city.
let plan: PerfumeGooglePlan;
const list: PerfumeContactList = {
  counts: { companies: 3, vendors: 1, customers: 1, both: 1, unclassified: 0, from_google: 1, needs_email: 1, people: 4, with_email: 3, phone_only: 1 },
  total: 3, limit: 300, offset: 0,
  rows: [
    { id: "c1", name: "Perfume Center", domain: "perfume-center.com", role: "both", vendor_type: null, customer_type: null, main_category: "Supplier / Brand", categories: [],
      city: null, state: null, country: null, phone: null, website: null, maps_uri: null, google_rating: null, google_rating_count: null, status: "active", source: "Master Database",
      first_contact_on: "2014-08-19", last_email_on: "2026-11-25", people: 21, with_email: 21, how_started: "Email" },
    { id: "c2", name: "Perfumería La Rosa", domain: null, role: "customer", vendor_type: null, customer_type: "Retailer", main_category: "Potential customer", categories: ["Perfume"],
      city: "Nuevo Laredo", state: "Tamps.", country: "MX", phone: "867 712 3456", website: "https://larosa.mx/", maps_uri: null, google_rating: "4.4", google_rating_count: 87,
      status: "prospect", source: "Google", first_contact_on: null, last_email_on: null, people: 0, with_email: 0, how_started: "Google business search" },
  ],
};
const posts: Array<[string, unknown]> = [];
beforeEach(() => {
  posts.length = 0;
  plan = { configured: true, field_mask: "places.id", running: null, full_matrix_unlocked: false,
    all: { searches: 836, maxRequests: 2508, cities: 44 }, first_city: { city: "Nuevo Laredo, Tamaulipas, México", searches: 19, maxRequests: 57, cities: 1 },
    cities: [], runs: [] };
  vi.mocked(clientApi.apiRequest).mockImplementation(async (path: string, opts?: { method?: string; body?: unknown }) => {
    if (path.startsWith("/api/v1/perfume/contacts?")) return list;
    if (path === "/api/v1/perfume/prospects/google-plan") return plan;
    if (opts?.method === "POST" && path === "/api/v1/perfume/contacts/import") {
      posts.push([path, opts.body]);
      const n = (opts.body as { records: unknown[] }).records.length;
      return { records: n, inserted: n - 1, matched: 1, by: { domain: 1 }, people_inserted: n, people_existing: 0, origins: n };
    }
    if (opts?.method === "POST") { posts.push([path, opts.body]); return { run_id: "run-1" }; }
    throw new Error(`unexpected ${path}`);
  });
});
const mount = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <ToastProvider><MemoryRouter initialEntries={["/perfume?tab=contacts"]}><PerfumeContactsPanel /></MemoryRouter></ToastProvider>
  </QueryClientProvider>);

describe("Contacts", () => {
  it("shows vendor + customer, how it started, and 'needs email' for a Google prospect", async () => {
    mount();
    const panel = await screen.findByTestId("perfume-contacts-panel");
    await waitFor(() => expect(within(panel).getAllByText("Perfume Center").length).toBeGreaterThan(0));
    expect(within(panel).getAllByText("Vendor + customer").length).toBeGreaterThan(0);
    expect(within(panel).getAllByText("Google business search").length).toBe(2); // the card title and the row's how-it-started
    expect(within(panel).getByText("needs email")).toBeTruthy();
    expect(within(panel).getByText("08/19/2014")).toBeTruthy();
  });

  it("first Google batch is Nuevo Laredo, shows its request count, and starts only on the second click; all cities stays locked", async () => {
    mount();
    const first = await screen.findByTestId("perfume-google-first");
    await waitFor(() => expect((first as HTMLButtonElement).disabled).toBe(false));
    expect((screen.getByTestId("perfume-google-all") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(first);
    const confirm = await screen.findByTestId("perfume-google-confirm");
    expect(confirm.textContent).toContain("19 searches, up to 57 Google requests");
    expect(posts).toHaveLength(0);
    fireEvent.click(screen.getByTestId("perfume-google-start"));
    await waitFor(() => expect(posts).toEqual([["/api/v1/perfume/prospects/google-run", { city: "Nuevo Laredo, Tamaulipas, México" }]]));
  });

  it("imports a contacts file in batches and shows new vs already in the list", async () => {
    mount();
    const input = await screen.findByTestId("perfume-contacts-import-file");
    const line = (n: string) => JSON.stringify({ company: { name: n, source: "Master Database" }, people: [], origins: [] });
    const file = new File([[line("A"), line("B"), line("C")].join("\n")], "master.jsonl", { type: "application/json" });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(screen.getByTestId("perfume-contacts-import-status").textContent).toContain("3 of 3 records · 2 new · 1 already in the list (domain 1)"));
    expect(posts.filter(([p]) => p === "/api/v1/perfume/contacts/import")).toHaveLength(1);
  });
});
