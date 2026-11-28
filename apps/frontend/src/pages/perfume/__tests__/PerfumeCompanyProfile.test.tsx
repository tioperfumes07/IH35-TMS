import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as clientApi from "../../../api/client";
import { ToastProvider } from "../../../components/Toast";
import { companyEmails, PerfumeCompanyProfile } from "../PerfumeCompanyProfile";

vi.mock("../../../api/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../../api/client")>()), apiRequest: vi.fn() }));
vi.mock("../ScentsxCustomerLink", () => ({ ScentsxCustomerLink: () => <div data-testid="sx-link" /> }));
vi.mock("../PerfumeCompanyEdit", () => ({ PerfumeCompanyEdit: () => <button type="button">Edit company</button> }));
vi.mock("../PerfumeCompanyRole", () => ({ CompanyRoleEditor: () => null }));

// Owner 2026-11-28 13:57 / 14:02 CT: a QuickBooks-style customer page — the profile on top, the tabs under it, one subject per tab.
const people = [
  { id: "p1", name: "Brian Oberlender", title: "Buyer", email: "brian@darielle.com", other_emails: ["bryan200029@yahoo.com", "BRIAN@darielle.com"], phones: ["(305) 555-0101"], role: "customer", how_started: null, first_contact_on: null, last_email_on: "2026-10-01", email_count: 42 },
  { id: "p2", name: "Ana Lopez", title: null, email: "ana@darielle.com", other_emails: [], phones: [], role: "customer", how_started: null, first_contact_on: null, last_email_on: null, email_count: 3 },
];
const posts: Array<[string, string, unknown]> = [];
beforeEach(() => {
  posts.length = 0;
  vi.mocked(clientApi.apiRequest).mockImplementation(async (path: string, opts?: { method?: string; body?: unknown }) => {
    if (path === "/api/v1/perfume/contacts/c1") return { company: { id: "c1", name: "Darielle", role: "both", customer_type: "Distributor", address: "100 Main St", city: "Miami", state: "FL", zip: "33101", country: "US", phone: "(305) 555-0100", website: "https://www.darielle.com/" }, people, origins: [] };
    if (path === "/api/v1/perfume/companies/c1/center") return { company: { id: "c1", name: "Darielle" }, notes: null, customer_ids: [], vendor_ids: [], open_ar_cents: 125000, open_ap_cents: 0, ar_aging: { current: 0, b1: 50000, b2: 0, b3: 0 }, ap_aging: { current: 0, b1: 0, b2: 0, b3: 0 }, quoted_cents: 0, ordered_cents: 0, bought_cents: 0, transactions: [], operating_company_id: "sx" };
    if (opts?.method) { posts.push([path, opts.method, opts.body]); return path.endsWith("/name") ? { changed: true, name: "Darielle LLC" } : { person: { id: "p9" }, changed: [] }; }
    throw new Error(`not in this test: ${path}`);
  });
});
const mount = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider><MemoryRouter><PerfumeCompanyProfile id="c1" backLabel="Back to Customers" onClose={() => {}} /></MemoryRouter></ToastProvider></QueryClientProvider>);

describe("company profile page", () => {
  it("every email once — a person's main and other emails, never repeated", () => {
    expect(companyEmails(people as never).map((e) => e.email)).toEqual(["brian@darielle.com", "bryan200029@yahoo.com", "ana@darielle.com"]);
  });
  it("header = the profile (name, what it is, address, email, phone, balances); Transactions is the first tab, details are their own tab", async () => {
    mount();
    await waitFor(() => expect(screen.getByTestId("perfume-profile-name").textContent).toBe("Darielle"));
    expect(screen.getByTestId("perfume-profile-kind").textContent).toContain("Vendor + customer · Distributor");
    const line = screen.getByTestId("perfume-profile-contactline").textContent ?? "";
    expect(line).toContain("100 Main St"); expect(line).toContain("Miami, FL 33101"); expect(line).toContain("brian@darielle.com"); expect(line).toContain("(305) 555-0100");
    expect(await within(screen.getByTestId("perfume-profile-balances")).findByText("$1,250.00")).toBeTruthy();
    expect(screen.getByTestId("perfume-profile-tab-txns").getAttribute("aria-selected")).toBe("true");
    expect(screen.queryByTestId("perfume-profile-info")).toBeNull(); // details are not mixed into the transactions view
    fireEvent.click(screen.getByTestId("perfume-profile-tab-emails"));
    expect(await screen.findByText("bryan200029@yahoo.com")).toBeTruthy();
    fireEvent.click(screen.getByTestId("perfume-profile-tab-details"));
    expect(within(await screen.findByTestId("perfume-profile-info")).getByText("Distributor")).toBeTruthy();
  });

  it("owner 14:05 CT: rename the company, add a person and edit a person from the profile", async () => {
    mount();
    await waitFor(() => expect(screen.getByTestId("perfume-profile-name").textContent).toBe("Darielle"));
    fireEvent.click(screen.getByTestId("perfume-profile-rename"));
    fireEvent.change(await screen.findByTestId("perfume-profile-rename-input"), { target: { value: "Darielle LLC" } });
    fireEvent.click(screen.getByTestId("perfume-profile-rename-save"));
    await waitFor(() => expect(posts).toContainEqual(["/api/v1/perfume/companies/c1/name", "PATCH", { name: "Darielle LLC" }]));
    fireEvent.click(screen.getByTestId("perfume-profile-tab-emails"));
    fireEvent.click(await screen.findByTestId("perfume-profile-add-person"));
    expect((screen.getByTestId("perfume-person-save") as HTMLButtonElement).disabled).toBe(true); // needs a name, email or phone
    fireEvent.change(screen.getByTestId("perfume-person-name"), { target: { value: "Carlos Ruiz" } });
    fireEvent.change(screen.getByTestId("perfume-person-email"), { target: { value: "carlos@darielle.com" } });
    fireEvent.change(screen.getByTestId("perfume-person-phones"), { target: { value: "(305) 555-0199, (305) 555-0200" } });
    fireEvent.click(screen.getByTestId("perfume-person-save"));
    await waitFor(() => expect(posts).toContainEqual(["/api/v1/perfume/companies/c1/people", "POST",
      { name: "Carlos Ruiz", title: null, email: "carlos@darielle.com", other_emails: [], phones: ["(305) 555-0199", "(305) 555-0200"], role: null }]));
    fireEvent.click(await screen.findByTestId("perfume-person-edit-p1"));
    fireEvent.change(screen.getByTestId("perfume-person-title"), { target: { value: "Owner" } });
    fireEvent.click(screen.getByTestId("perfume-person-save"));
    await waitFor(() => expect(posts.some(([p, m, b]) => p === "/api/v1/perfume/people/p1" && m === "PATCH" && (b as { title: string }).title === "Owner")).toBe(true));
  });

  it("an address that already holds the city is not repeated; the phone falls back to the first person's", async () => {
    vi.mocked(clientApi.apiRequest).mockImplementation(async (path: string) => {
      if (path === "/api/v1/perfume/contacts/c1") return { company: { id: "c1", name: "A & A Beauty Supply", role: "customer", address: "784 Main St, Johnson City, NY 13790", city: "Johnson City", state: "NY", country: "US", phone: null }, people: [{ id: "p1", name: null, email: null, phones: ["(607) 217-0777"], role: "customer", how_started: null, first_contact_on: null, last_email_on: null, email_count: null }], origins: [] };
      if (path === "/api/v1/perfume/companies/c1/center") return { company: { id: "c1", name: "x" }, notes: null, customer_ids: [], vendor_ids: [], open_ar_cents: 0, open_ap_cents: 0, ar_aging: { current: 0, b1: 0, b2: 0, b3: 0 }, ap_aging: { current: 0, b1: 0, b2: 0, b3: 0 }, quoted_cents: 0, ordered_cents: 0, bought_cents: 0, transactions: [], operating_company_id: "sx" };
      throw new Error(`not in this test: ${path}`);
    });
    mount();
    await waitFor(() => expect(screen.getByTestId("perfume-profile-contactline").textContent).toContain("(607) 217-0777"));
    const t = screen.getByTestId("perfume-profile-contactline").textContent ?? "";
    expect(t.split("Johnson City").length - 1).toBe(1);
  });
});
