import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as clientApi from "../../../api/client";
import { ToastProvider } from "../../../components/Toast";
import { PerfumeCreateCompany } from "../PerfumeCreateCompany";

vi.mock("../../../api/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../../api/client")>()), apiRequest: vi.fn() }));

// Owner 2026-11-28 14:58 CT: catalogs as multi-select drop-downs (Relationship, Business type), address boxes sized like an address,
// and SEVERAL contacts in the creator.
const kinds = [
  { kind: "category", values: [{ value: "Supplier / Brand" }, { value: "Potential customer" }] },
  { kind: "segment", values: [{ value: "Perfume wholesale" }, { value: "Beauty supply / cosmetics" }] },
  { kind: "industry", values: [{ value: "Perfume" }] }, { kind: "review_tag", values: [] }, { kind: "vendor_type", values: [{ value: "Distributor" }] },
];
const posts: Array<[string, unknown]> = [];
beforeEach(() => {
  posts.length = 0;
  vi.mocked(clientApi.apiRequest).mockImplementation(async (path: string, opts?: { method?: string; body?: unknown }) => {
    if (path.startsWith("/api/v1/perfume/catalogs")) return { kinds };
    if (opts?.method === "POST" && path === "/api/v1/perfume/contacts/create") { posts.push([path, opts.body]); return { id: "new1", existed: false }; }
    throw new Error(`not in this test: ${path}`);
  });
});

describe("create vendor — the professional creator", () => {
  it("several relationships and business types, address sized like an address, three contacts", async () => {
    const opened: string[] = [];
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider><MemoryRouter>
      <PerfumeCreateCompany role="vendor" onCreated={() => {}} onOpen={(id) => opened.push(id)} /></MemoryRouter></ToastProvider></QueryClientProvider>);
    fireEvent.click(screen.getByTestId("perfume-create-vendor"));
    const d = await screen.findByTestId("perfume-create-modal");
    fireEvent.change(within(d).getByTestId("perfume-create-name"), { target: { value: "Darielle" } });

    // Relationship: two values from the drop-down
    const rel = within(d).getByTestId("perfume-create-relationships");
    fireEvent.click(within(rel).getAllByRole("button")[0]!);
    await waitFor(() => expect(within(rel).getByText("Supplier / Brand")).toBeTruthy());
    fireEvent.click(within(rel).getByText("Supplier / Brand"));
    fireEvent.click(within(rel).getByText("Potential customer"));
    const bt = within(d).getByTestId("perfume-create-business-types");
    fireEvent.click(within(bt).getAllByRole("button")[0]!);
    fireEvent.click(await within(bt).findByText("Perfume wholesale"));
    fireEvent.click(within(bt).getByText("Beauty supply / cosmetics"));

    // Address: street full width, State and ZIP narrow, City wide
    const span = (k: string) => within(d).getByTestId(`perfume-create-${k}`).closest("label")!.className;
    expect(span("address")).toContain("col-span-12");
    expect(span("state")).toContain("md:col-span-2");
    expect(span("zip")).toContain("md:col-span-2");
    expect(span("city")).toContain("md:col-span-5");
    fireEvent.change(within(d).getByTestId("perfume-create-city"), { target: { value: "Miami" } });
    fireEvent.change(within(d).getByTestId("perfume-create-state"), { target: { value: "FL" } });
    fireEvent.change(within(d).getByTestId("perfume-create-zip"), { target: { value: "33172" } });

    // Three contacts
    fireEvent.change(within(d).getByTestId("perfume-create-contact-0-name"), { target: { value: "Brian Oberlender" } });
    fireEvent.change(within(d).getByTestId("perfume-create-contact-0-email"), { target: { value: "Bryan200029@yahoo.com" } });
    fireEvent.click(within(d).getByTestId("perfume-create-contact-add"));
    fireEvent.change(within(d).getByTestId("perfume-create-contact-1-name"), { target: { value: "Ana Lopez" } });
    fireEvent.change(within(d).getByTestId("perfume-create-contact-1-phone"), { target: { value: "(305) 555-0101" } });
    fireEvent.click(within(d).getByTestId("perfume-create-contact-add"));
    fireEvent.change(within(d).getByTestId("perfume-create-contact-2-email"), { target: { value: "not-an-email" } });
    expect((within(d).getByTestId("perfume-create-save") as HTMLButtonElement).disabled).toBe(true); // a bad email blocks Save
    fireEvent.change(within(d).getByTestId("perfume-create-contact-2-email"), { target: { value: "orders@darielle.com" } });

    fireEvent.click(within(d).getByTestId("perfume-create-save"));
    await waitFor(() => expect(posts).toHaveLength(1));
    const body = posts[0]![1] as { company: Record<string, unknown>; people: Array<Record<string, unknown>> };
    expect(body.company).toMatchObject({ name: "Darielle", role: "vendor", city: "Miami", state: "FL", zip: "33172",
      relationships: ["Supplier / Brand", "Potential customer"], main_category: "Supplier / Brand",
      business_types: ["Perfume wholesale", "Beauty supply / cosmetics"], segment: "Perfume wholesale", domain: null }); // a yahoo address is never the company domain
    expect(body.people).toEqual([
      { name: "Brian Oberlender", title: null, email: "bryan200029@yahoo.com", phones: [], role: "vendor" },
      { name: "Ana Lopez", title: null, email: null, phones: ["(305) 555-0101"], role: "vendor" },
      { name: null, title: null, email: "orders@darielle.com", phones: [], role: "vendor" },
    ]);
    await waitFor(() => expect(opened).toEqual(["new1"]));
  });
});
