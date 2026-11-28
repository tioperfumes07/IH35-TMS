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
  facets: { country: [{ value: "MX", count: 1 }, { value: "US", count: 1 }], state: [{ value: "Tamps.", count: 1 }],
    city: [{ value: "Nuevo Laredo", count: 1 }, { value: "Laredo", count: 1 }], category: [{ value: "Perfume", count: 1 }], relationship: [{ value: "Customer", count: 1 }], industry: [{ value: "Perfume", count: 1 }], tag: [],
    source: [{ value: "Google", count: 1 }, { value: "Master Database", count: 1 }], how: [{ value: "Email", count: 1 }] },
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
const gets: string[] = [];
beforeEach(() => {
  posts.length = 0;
  plan = { configured: true, field_mask: "places.id", running: null, full_matrix_unlocked: false,
    all: { searches: 836, maxRequests: 2508, cities: 44 }, first_city: { city: "Nuevo Laredo, Tamaulipas, México", searches: 19, maxRequests: 57, cities: 1 },
    cities: [], runs: [] };
  vi.mocked(clientApi.apiRequest).mockImplementation(async (path: string, opts?: { method?: string; body?: unknown }) => {
    if (path.startsWith("/api/v1/perfume/contacts?")) { gets.push(path); return list; }
    if (path === "/api/v1/perfume/prospects/google-plan") return plan;
    if (opts?.method === "POST" && path === "/api/v1/perfume/contacts/import") {
      posts.push([path, opts.body]);
      const n = (opts.body as { records: unknown[] }).records.length;
      return { records: n, inserted: n - 1, matched: 1, by: { domain: 1 }, people_inserted: n, people_existing: 0, origins: n };
    }
    if (opts?.method === "POST" && path === "/api/v1/perfume/contacts/delete") {
      posts.push([path, opts.body]);
      return { deleted: 1, people: 21, already_deleted: 0, not_found: 0, kept: [{ id: "c2", name: "Perfumería La Rosa", reason: "has quotes" }] };
    }
    if (opts?.method === "POST" && path === "/api/v1/perfume/contacts/duplicates/merge-one") { posts.push([path, opts.body]); return { merged: 1 }; }
    if (opts?.method === "POST" && path === "/api/v1/perfume/contacts/approve") { posts.push([path, opts.body]); return { approved: 2, not_found: 0 }; }
    if (opts?.method === "POST" && path === "/api/v1/perfume/contacts/unapprove") { posts.push([path, opts.body]); return { sent_back: 1, kept: [] }; }
    if (opts?.method === "POST" && path === "/api/v1/perfume/contacts/restore") { posts.push([path, opts.body]); return { restored: 1 }; }
    if (opts?.method === "POST") { posts.push([path, opts.body]); return { run_id: "run-1" }; }
    throw new Error(`unexpected ${path}`);
  });
});
const mount = (initialRole?: "customer" | "vendor") => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <ToastProvider><MemoryRouter initialEntries={["/perfume?tab=contacts"]}>{initialRole ? <PerfumeContactsPanel initialRole={initialRole} /> : <PerfumeContactsPanel />}</MemoryRouter></ToastProvider>
  </QueryClientProvider>);

describe("Contacts", () => {
  it("shows vendor + customer, how it started, and 'needs email' for a Google prospect", async () => {
    mount();
    const panel = await screen.findByTestId("perfume-contacts-panel");
    await waitFor(() => expect(within(panel).getAllByText("Perfume Center").length).toBeGreaterThan(0));
    expect(within(panel).getAllByText("Vendor + customer").length).toBeGreaterThan(0);
    expect(within(panel).getAllByText("Google business search").length).toBe(2); // the card title and the row's how-it-started
    expect(within(panel).getAllByText("needs email").length).toBeGreaterThan(0);
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
  // Owner 2026-11-26 15:56 CT: "the boxes are not drop down filter combobox so i can typ city etc."
  it("every filter box is a drop-down you type in; picking a city filters the list", async () => {
    mount();
    await waitFor(() => expect(gets.length).toBeGreaterThan(0));
    await screen.findAllByText("Perfume Center");
    const box = await screen.findByTestId("perfume-contacts-filter-city");
    for (const f of ["country", "state", "relationship", "industry", "tag", "source", "how"]) expect(screen.getByTestId(`perfume-contacts-filter-${f}`)).toBeTruthy();
    fireEvent.click(within(box).getByRole("button", { name: /All cities/ }));
    fireEvent.change(screen.getByTestId("perfume-contacts-filter-city-search"), { target: { value: "nuevo" } });
    await waitFor(() => expect(screen.getByText("Nuevo Laredo (1)")).toBeTruthy());
    fireEvent.click(screen.getByText("Nuevo Laredo (1)"));
    await waitFor(() => expect(gets.some((g) => g.includes("cities=Nuevo+Laredo"))).toBe(true));
  });

  it("select several → Delete asks in the page, deletes, names the one kept and why, and Undo puts the deleted back", async () => {
    mount();
    const panel = await screen.findByTestId("perfume-contacts-panel");
    await waitFor(() => expect(within(panel).getAllByText("Perfume Center").length).toBeGreaterThan(0));
    const del = screen.getByTestId("perfume-contacts-delete") as HTMLButtonElement;
    expect(del.disabled).toBe(true);
    const row = (name: string) => within(panel).getAllByText(name).map((el) => el.closest("tr")).find(Boolean)!;
    fireEvent.click(within(row("Perfume Center")).getByRole("checkbox"));
    fireEvent.click(within(row("Perfumería La Rosa")).getByRole("checkbox"));
    await waitFor(() => expect(del.disabled).toBe(false));
    expect(del.textContent).toContain("Delete 2 selected");
    fireEvent.click(del);
    expect(posts).toHaveLength(0);
    fireEvent.click(await screen.findByTestId("perfume-contacts-delete-confirm"));
    await waitFor(() => expect(posts[0]).toEqual(["/api/v1/perfume/contacts/delete", { ids: ["c1", "c2"] }]));
    expect((await screen.findByTestId("perfume-contacts-kept")).textContent).toContain("Perfumería La Rosa (has quotes)");
    fireEvent.click(screen.getByTestId("perfume-contacts-undo-delete"));
    await waitFor(() => expect(posts[1]).toEqual(["/api/v1/perfume/contacts/restore", { ids: ["c1"] }]));
  });

  it("select several → Merge asks which company stays, confirms in the page, and merges the others into it", async () => {
    mount();
    const panel = await screen.findByTestId("perfume-contacts-panel");
    await waitFor(() => expect(within(panel).getAllByText("Perfume Center").length).toBeGreaterThan(0));
    const merge = screen.getByTestId("perfume-contacts-merge") as HTMLButtonElement;
    expect(merge.disabled).toBe(true);
    const row = (name: string) => within(panel).getAllByText(name).map((el) => el.closest("tr")).find(Boolean)!;
    fireEvent.click(within(row("Perfume Center")).getByRole("checkbox"));
    expect(merge.disabled).toBe(true); // one company cannot merge
    fireEvent.click(within(row("Perfumería La Rosa")).getByRole("checkbox"));
    await waitFor(() => expect(merge.disabled).toBe(false));
    expect(merge.textContent).toContain("Merge 2 selected");
    fireEvent.click(merge);
    const modal = await screen.findByTestId("perfume-contacts-merge-modal");
    fireEvent.click(within(modal).getByTestId("perfume-contacts-merge-keep-c2"));
    expect(posts).toHaveLength(0);
    fireEvent.click(within(modal).getByTestId("perfume-contacts-merge-confirm"));
    await waitFor(() => expect(posts[0]).toEqual(["/api/v1/perfume/contacts/duplicates/merge-one", { keep: "c2", ids: ["c1"] }]));
  });

  it("owner 14:30 CT: Leads list only leads and approve them; Customers lists only approved and can send back to Leads", async () => {
    mount();
    const panel = await screen.findByTestId("perfume-contacts-panel");
    await waitFor(() => expect(within(panel).getAllByText("Perfume Center").length).toBeGreaterThan(0));
    expect(gets.some((g) => g.includes("stage=lead"))).toBe(true);
    const row = (name: string) => within(panel).getAllByText(name).map((el) => el.closest("tr")).find(Boolean)!;
    fireEvent.click(within(row("Perfume Center")).getByRole("checkbox"));
    fireEvent.click(within(row("Perfumería La Rosa")).getByRole("checkbox"));
    fireEvent.click(screen.getByTestId("perfume-contacts-approve-customer"));
    expect(posts).toHaveLength(0); // asked in the page first
    fireEvent.click(await screen.findByTestId("perfume-contacts-approve-confirm"));
    await waitFor(() => expect(posts[0]).toEqual(["/api/v1/perfume/contacts/approve", { ids: ["c1", "c2"], role: "customer" }]));
  });
  it("Customers: the list asks for approved only and offers Send back to leads (no Approve)", async () => {
    gets.length = 0;
    mount("customer");
    const panel = await screen.findByTestId("perfume-contacts-panel");
    await waitFor(() => expect(within(panel).getAllByText("Perfume Center").length).toBeGreaterThan(0));
    expect(gets.some((g) => g.includes("stage=approved") && g.includes("role=customer"))).toBe(true);
    expect(screen.queryByTestId("perfume-contacts-approve-customer")).toBeNull();
    const row = (name: string) => within(panel).getAllByText(name).map((el) => el.closest("tr")).find(Boolean)!;
    fireEvent.click(within(row("Perfume Center")).getByRole("checkbox"));
    fireEvent.click(screen.getByTestId("perfume-contacts-sendback"));
    fireEvent.click(await screen.findByTestId("perfume-contacts-sendback-confirm"));
    await waitFor(() => expect(posts[0]).toEqual(["/api/v1/perfume/contacts/unapprove", { ids: ["c1"] }]));
  });
});
