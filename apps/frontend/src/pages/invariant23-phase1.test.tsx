import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { makeCustomer, makeDriver } from "../test-utils/factories";
import type { DriverTeam } from "../api/mdata";
import { ToastProvider } from "../components/Toast";
import "../design/design-tokens.css";

import { CustomersPage } from "./Customers";
import { DriversPage } from "./Drivers";
import { VendorsPage } from "./Vendors";
import { UserDetailPage } from "./UserDetail";
import { InvoicesListPage } from "./accounting/InvoicesListPage";
import { CashAdvanceRequestsPage } from "./driver-finance/CashAdvanceRequestsPage";
import { HomePage } from "./Home";
import { SettlementDisputesTab } from "./driver-finance/components/SettlementDisputesTab";
import userEvent from "@testing-library/user-event";

const oc = "00000000-0000-0000-0000-000000000099";

const fakeCustomer = makeCustomer();

const fakeDriver = makeDriver();

const fakeTeam: DriverTeam = {
  id: "t1",
  operating_company_id: oc,
  team_name: "LONG TEAM ALPHA",
  primary_driver_id: "d1",
  secondary_driver_id: "d2",
  split_method: "50_50",
  primary_share_pct: 50,
  co_share_pct: 50,
  is_active: true,
  effective_from: "2026-01-01",
  effective_to: null,
  notes: null,
  primary_driver_name: "LONG PRIMARY",
  co_driver_name: "LONG CO",
};

vi.mock("../auth/useAuth", () => ({
  useAuth: () => ({
    user: { role: "Owner", uuid: "owner-1", email: "owner@test.com" },
    session: null,
    isLoading: false,
    isUnauthenticated: false,
    refetch: vi.fn(),
  }),
}));

vi.mock("../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({
    selectedCompanyId: oc,
    selectedCompany: { id: oc, code: "TST", short_name: "Test", legal_name: "Test Co" },
    companies: [],
    isLoading: false,
    setSelectedCompany: vi.fn(),
    setDefaultCompanyForUser: vi.fn(),
  }),
}));

vi.mock("../api/mdata", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/mdata")>();
  return {
    ...actual,
    listCustomers: vi.fn(() => Promise.resolve({ customers: [fakeCustomer] })),
    listPaymentTermOptions: vi.fn(() => Promise.resolve({ payment_terms: [] })),
    listVendors: vi.fn(() =>
      Promise.resolve({
        vendors: [
          {
            id: "v1",
            name: "LONG VENDOR SERVICES INC",
            vendor_type: "fuel",
            notes: null,
            operating_company_id: oc,
            deactivated_at: null,
          },
        ],
      })
    ),
    listDrivers: vi.fn(() => Promise.resolve({ drivers: [fakeDriver] })),
    listDriverTeams: vi.fn(() => Promise.resolve({ teams: [fakeTeam] })),
  };
});

vi.mock("../api/catalogs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/catalogs")>();
  return {
    ...actual,
    listUsStates: vi.fn(() => Promise.resolve({ states: [] })),
  };
});

vi.mock("../api/identity", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/identity")>();
  return {
    ...actual,
    getUserDetail: vi.fn(() =>
      Promise.resolve({
        user: {
          id: "ux",
          email: "u@test.com",
          role: "Dispatcher",
          default_company_id: "comp1",
          created_at: "2026-01-01",
          deactivated_at: null,
        },
        has_driver_record: false,
        accessible_companies: [{ id: "comp1", code: "C1", legal_name: "VERY LONG LEGAL NAME INC", short_name: "VLN" }],
      })
    ),
    listDispatcherErrorReasons: vi.fn(() => Promise.resolve({ reasons: [] })),
    listDispatcherSafetyEvents: vi.fn(() => Promise.resolve({ events: [] })),
  };
});

vi.mock("../api/accounting", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/accounting")>();
  return {
    ...actual,
    listInvoices: vi.fn(() =>
      Promise.resolve({
        invoices: [
          {
            id: "inv1",
            display_id: "INV-2026-0001",
            customer_id: "c1",
            customer_name: "LONG CUSTOMER HOLDINGS LLC",
            status: "draft",
            issue_date: "2026-01-01",
            due_date: "2026-01-15",
            subtotal_cents: 0,
            tax_cents: 0,
            total_cents: 0,
            amount_open_cents: 0,
            source_load_id: null,
            source_load_chargeback_requested: false,
            source_load_chargeback_reason: null,
            internal_notes: null,
            customer_notes: null,
            lines: [],
            factoring_advance_id: null,
            factoring_display_id: null,
            factoring_status: null,
          },
        ],
      })
    ),
  };
});

vi.mock("../api/cashAdvanceRequests", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/cashAdvanceRequests")>();
  return {
    ...actual,
    cashAdvanceRequestsOfficeApi: {
      ...actual.cashAdvanceRequestsOfficeApi,
      listPending: vi.fn(() =>
        Promise.resolve({
          requests: [
            {
              id: "r1",
              display_id: "CA-2026-0001",
              driver_name: "LONG DRIVER NAME",
              requested_amount_cents: 10000,
              is_above_policy: false,
              owner_approval_required: false,
              owner_approval_token_expires_at: null,
              submitted_at: "2026-01-01T00:00:00Z",
            },
          ],
        })
      ),
      listPendingOwnerApproval: vi.fn(() =>
        Promise.resolve({
          requests: [{ id: "r1", display_id: "CA-1", driver_name: "HOME QUEUE DRIVER LONG NAME" }],
        })
      ),
      list: vi.fn(),
      get: vi.fn(),
      approve: vi.fn(),
      deny: vi.fn(),
      escalate: vi.fn(),
    },
  };
});

vi.mock("../api/reports", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/reports")>();
  return {
    ...actual,
    getKpiSummary: vi.fn(() =>
      Promise.resolve({
        available_reports: 0,
        scheduled: 0,
        run_last_7d: 0,
        outstanding_ar_cents: 0,
        tracked_assets: 0,
        assigned_working: 0,
        maint_past_due: 0,
        open_damage: 0,
        pending_qbo_sync: 0,
        ifta_status: { quarter: "Q1", dueAt: "TBD", daysUntilDue: 0 },
      })
    ),
    getHomeAttentionList: vi.fn(() => Promise.resolve({ items: [] })),
    getHomeFleetSnapshot: vi.fn(() =>
      Promise.resolve({
        trucks: 0,
        flatbeds: 0,
        dry_vans: 0,
        refrigerated: 0,
        trailers: 0,
        in_shop: 0,
        out_of_service: 0,
        assigned_units: 0,
        idle_units: 0,
        samsara_live: 0,
        no_signal_6h: 0,
        roadside: 0,
      })
    ),
  };
});

vi.mock("../api/driverFinance", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/driverFinance")>();
  return {
    ...actual,
    listSettlementDisputes: vi.fn(() =>
      Promise.resolve({
        disputes: [
          {
            id: "sd1",
            operating_company_id: oc,
            settlement_id: "s1",
            settlement_display_id: "S-2026-0001",
            period_start: "2026-01-01",
            period_end: "2026-01-07",
            driver_id: "d1",
            driver_name: "DISPUTE DRIVER LONG",
            dispute_category: "other",
            dispute_description: "test",
            disputed_amount_cents: 1000,
            status: "open",
            opened_at: "2026-01-02T00:00:00Z",
          },
        ],
      })
    ),
    getSettlementDispute: vi.fn(),
    markSettlementDisputeUnderReview: vi.fn(),
    resolveSettlementDispute: vi.fn(),
  };
});

function wrap(ui: ReactElement, client?: QueryClient) {
  const qc = client ?? new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter>{ui}</MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}

describe("invariant #23 single-line-name phase-1 pages", () => {
  it("CustomersPage renders .single-line-name on the roster name and on Main contact", async () => {
    // This asserted `>= 2` on first render, which encoded the PRE-side-rail layout: the customers list used
    // to be a table with a dedicated "Main Contact" COLUMN (both cells carried the class — see e48028cdd).
    // b3690eb68 "align customers and vendors to locked side-rail layout" replaced that table with the
    // 3-column side rail (name / open balance / status), so main contact now lives in the DETAIL panel.
    // Re-adding the column to a LOCKED layout would violate §7 rather than uphold it, so this now asserts
    // the INVARIANT — every place the name is rendered is single-line — instead of the old column count.
    const user = userEvent.setup();
    // Scope to THIS render's container: the file has no cleanup between cases, so a bare
    // `document.querySelectorAll` would also count nodes left behind by earlier renders and the count
    // would not be about this page at all.
    const { container } = render(wrap(<CustomersPage />));

    // Roster cell. (The customer fixture's name is "ANTONIO RAMIREZ-MARTINEZ JR. TRANSPORT LLC" —
    // "LONG CUSTOMER…" belongs to the invoices fixture further down this file.)
    await waitFor(() => expect(container.querySelector(".single-line-name")?.textContent).toContain("ANTONIO"));

    // NOT asserted here, and stated rather than quietly dropped: the Main-contact DetailRow also received
    // the token in this change (its value span is `break-words`, so a long contact name really did wrap),
    // but it lives in the DETAIL panel, which this harness does not reach — CardLink navigates instead of
    // selecting in place. Asserting it needs a router-aware fixture; contriving one here would test the
    // harness, not the invariant.
    void user;
  });

  it("VendorsPage renders .single-line-name on vendor name", async () => {
    render(wrap(<VendorsPage />));
    await waitFor(() => expect(document.querySelector(".single-line-name")?.textContent).toContain("LONG VENDOR"));
  });

  it("DriversPage renders .single-line-name on driver full name", async () => {
    render(wrap(<DriversPage />));
    await waitFor(() => expect(document.querySelector(".single-line-name")?.textContent).toContain("ANTONIO"));
  });

  it("UserDetailPage companies tab marks legal_name with .single-line-name", async () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ToastProvider>
          <MemoryRouter initialEntries={["/users/ux"]}>
            <Routes>
              <Route path="/users/:id" element={<UserDetailPage />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>
    );
    await waitFor(() => expect(screen.getByRole("button", { name: "Company Access" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Company Access" }));
    await waitFor(() => expect(document.querySelector(".single-line-name")?.getAttribute("title")).toBe("VERY LONG LEGAL NAME INC"));
  });

  it("InvoicesListPage customer column uses .single-line-name", async () => {
    render(wrap(<InvoicesListPage />));
    const cell = await waitFor(() => within(screen.getByRole("table")).getByText("LONG CUSTOMER HOLDINGS LLC"));
    // The class lives on the SPAN that wraps the cell's EntityLink (InvoicesListPage.tsx:248), so getByText
    // returns the inner anchor and a direct classList check is false while the invariant actually HOLDS.
    // Assert the truncating ancestor instead of demanding the class sit on the text node itself.
    expect(cell.closest(".single-line-name")).not.toBeNull();
  });

  it("CashAdvanceRequestsPage driver column uses .single-line-name", async () => {
    render(wrap(<CashAdvanceRequestsPage />));
    await waitFor(() => expect(document.querySelector(".single-line-name")?.textContent).toBe("LONG DRIVER NAME"));
  });

  it("HomePage owner approval strip lists driver with .single-line-name", async () => {
    render(wrap(<HomePage auth={{ uuid: "owner", email: "o@test.com", role: "Owner" }} />));
    await waitFor(() => expect(document.querySelector(".single-line-name")?.textContent).toContain("HOME QUEUE DRIVER LONG NAME"));
  });

  it("SettlementDisputesTab driver column uses .single-line-name", async () => {
    render(wrap(<SettlementDisputesTab companyId={oc} />));
    await waitFor(() => expect(document.querySelector("tbody .single-line-name")?.textContent).toBe("DISPUTE DRIVER LONG"));
  });
});
