import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement, ReactNode } from "react";
import {
  MemoryRouter,
  Route,
  Routes,
  createMemoryRouter,
  RouterProvider,
  useLocation,
} from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as accountingApi from "../../../api/accounting";
import * as mdataApi from "../../../api/mdata";
import { ToastProvider } from "../../../components/Toast";
import { InvoicesListPage } from "../InvoicesListPage";

const COMPANY_ID = "00000000-0000-4000-8000-000000000099";
const CUSTOMER_ID = "11111111-1111-4111-8111-111111111111";
const CUSTOMER_B = "22222222-2222-4222-8222-222222222222";

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: COMPANY_ID }),
}));

vi.mock("../AccountingSubNavWrapper", () => ({
  AccountingSubNavWrapper: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("../../../components/shared/EntityLink", () => ({
  EntityLink: ({ label }: { label: string }) => <span>{label}</span>,
}));

vi.mock("../../../components/shared/SelectCombobox", () => ({
  SelectCombobox: ({
    value,
    onChange,
    children,
    className,
  }: {
    value?: string;
    onChange?: (e: { target: { value: string } }) => void;
    children?: ReactNode;
    className?: string;
  }) => (
    <select
      className={className}
      value={value ?? ""}
      onChange={(e) => onChange?.({ target: { value: e.target.value } })}
    >
      {children}
    </select>
  ),
}));

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="location-search">{loc.search}</div>;
}

function wrap(ui: ReactElement, initialEntry: string) {
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>
        <MemoryRouter initialEntries={[initialEntry]}>
          <Routes>
            <Route
              path="/accounting/invoices"
              element={
                <>
                  <LocationProbe />
                  {ui}
                </>
              }
            />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}

function invoice(partial: Record<string, unknown>) {
  return {
    id: "inv-1",
    operating_company_id: COMPANY_ID,
    customer_id: CUSTOMER_ID,
    customer_name: "Acme Freight",
    display_id: "INV-1",
    status: "sent",
    source_load_id: null,
    issue_date: "2026-07-01",
    due_date: "2026-07-31",
    sent_at: "2026-07-01T00:00:00.000Z",
    voided_at: null,
    void_reason: null,
    subtotal_cents: 12_500,
    tax_cents: 0,
    total_cents: 12_500,
    amount_paid_cents: 0,
    amount_open_cents: 12_500,
    payment_terms_label: null,
    payment_terms_days: null,
    internal_notes: null,
    customer_notes: null,
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
    ...partial,
  };
}

describe("InvoicesListPage has_balance deep-link + URL sync (A/R aging contract)", () => {
  beforeEach(() => {
    vi.spyOn(mdataApi, "listCustomers").mockResolvedValue({
      customers: [
        { id: CUSTOMER_ID, customer_name: "Acme Freight" },
        { id: CUSTOMER_B, customer_name: "Beta Logistics" },
      ],
    } as never);
    vi.spyOn(accountingApi, "listInvoices").mockResolvedValue({
      invoices: [
        invoice({ id: "inv-open", display_id: "INV-1", status: "sent", amount_open_cents: 12_500 }),
        invoice({
          id: "inv-partial",
          display_id: "INV-3",
          status: "partial",
          amount_open_cents: 4_000,
          amount_paid_cents: 8_500,
        }),
      ],
      total: 2,
      limit: 100,
      offset: 0,
      has_more: false,
    } as never);
  });

  async function openFilters() {
    const user = userEvent.setup();
    await user.click(screen.getByTestId("invoices-filters-toggle"));
    return user;
  }

  it("honors ?customer_id=&has_balance=true via server filter (not client with_balance page slice)", async () => {
    render(
      wrap(
        <InvoicesListPage />,
        `/accounting/invoices?customer_id=${CUSTOMER_ID}&has_balance=true`
      )
    );

    await waitFor(() => {
      expect(accountingApi.listInvoices).toHaveBeenCalledWith(
        COMPANY_ID,
        expect.objectContaining({
          customer_id: CUSTOMER_ID,
          has_balance: true,
          status: undefined,
        })
      );
    });

    await openFilters();
    expect(await screen.findByDisplayValue("With balance")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("INV-1")).toBeInTheDocument());
    expect(screen.getByText(/Rows: 2 of 2/)).toBeInTheDocument();
  });

  it("migrates legacy ?status=with_balance to has_balance=true and calls server has_balance", async () => {
    render(
      wrap(
        <InvoicesListPage />,
        `/accounting/invoices?customer_id=${CUSTOMER_ID}&status=with_balance`
      )
    );

    await waitFor(() => {
      expect(screen.getByTestId("location-search").textContent).toContain("has_balance=true");
      expect(screen.getByTestId("location-search").textContent).not.toContain("status=with_balance");
    });

    await waitFor(() => {
      expect(accountingApi.listInvoices).toHaveBeenCalledWith(
        COMPANY_ID,
        expect.objectContaining({
          customer_id: CUSTOMER_ID,
          has_balance: true,
        })
      );
    });
  });

  it("writes status/has_balance/customer_id bidirectionally into searchParams on filter change", async () => {
    render(wrap(<InvoicesListPage />, `/accounting/invoices?customer_id=${CUSTOMER_ID}&has_balance=true`));

    await waitFor(() => expect(accountingApi.listInvoices).toHaveBeenCalled());
    const user = await openFilters();
    const statusSelect = await screen.findByDisplayValue("With balance");
    await user.selectOptions(statusSelect, "sent");
    // Filters are staged (useStagedListFilters) — a draft change only commits to the URL/query
    // once Apply is clicked, matching the shared CollapsedListFilters Apply/Cancel/Reset chrome.
    await user.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() => {
      const q = screen.getByTestId("location-search").textContent ?? "";
      expect(q).toContain("status=sent");
      expect(q).not.toContain("has_balance=true");
      expect(q).toContain(`customer_id=${CUSTOMER_ID}`);
    });

    await waitFor(() => {
      expect(accountingApi.listInvoices).toHaveBeenCalledWith(
        COMPANY_ID,
        expect.objectContaining({
          status: "sent",
          has_balance: undefined,
          customer_id: CUSTOMER_ID,
        })
      );
    });
  });

  it("re-reads searchParams on same-route query change (popstate / back-forward)", async () => {
    const router = createMemoryRouter(
      [
        {
          path: "/accounting/invoices",
          element: (
            <>
              <LocationProbe />
              <InvoicesListPage />
            </>
          ),
        },
      ],
      { initialEntries: [`/accounting/invoices?customer_id=${CUSTOMER_ID}&has_balance=true`] }
    );

    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(accountingApi.listInvoices).toHaveBeenCalledWith(
        COMPANY_ID,
        expect.objectContaining({ has_balance: true, customer_id: CUSTOMER_ID })
      );
    });

    await router.navigate(`/accounting/invoices?customer_id=${CUSTOMER_B}&status=partial`);

    await waitFor(() => {
      expect(accountingApi.listInvoices).toHaveBeenCalledWith(
        COMPANY_ID,
        expect.objectContaining({
          customer_id: CUSTOMER_B,
          status: "partial",
          has_balance: undefined,
        })
      );
    });
    await openFilters();
    expect(await screen.findByDisplayValue("Partial")).toBeInTheDocument();
    expect(screen.getByTestId("location-search").textContent).toContain("status=partial");
  });
});

describe("InvoicesListPage LV-AR-OPEN-INCLUDES-VOIDED (ACCT-F5027)", () => {
  beforeEach(() => {
    vi.spyOn(mdataApi, "listCustomers").mockResolvedValue({
      customers: [{ id: CUSTOMER_ID, customer_name: "Acme Freight" }],
    } as never);
  });

  it("excludes void invoices from Total billed / Open and shows $0.00 Open on void rows", async () => {
    vi.spyOn(accountingApi, "listInvoices").mockResolvedValue({
      invoices: [
        invoice({
          id: "inv-live",
          display_id: "INV-LIVE",
          status: "partial",
          total_cents: 120_000,
          amount_open_cents: 95_000,
        }),
        invoice({
          id: "inv-void",
          display_id: "INV-VOID",
          status: "void",
          voided_at: "2026-08-07T00:00:00.000Z",
          total_cents: 245_000,
          amount_open_cents: 245_000,
        }),
        invoice({
          id: "inv-void-stamp",
          display_id: "INV-VOID2",
          status: "sent",
          voided_at: "2026-08-07T12:00:00.000Z",
          total_cents: 100,
          amount_open_cents: 100,
        }),
      ],
      total: 3,
      limit: 100,
      offset: 0,
      has_more: false,
    } as never);

    render(wrap(<InvoicesListPage />, "/accounting/invoices"));

    await waitFor(() => expect(screen.getByText("INV-LIVE")).toBeInTheDocument());

    // Live open $950 + live total $1,200 — voids contribute $0 to both aggregates
    // (board live proof: void $2,450 must not inflate Open / Total billed).
    expect(screen.getByText(/Total billed:\s*\$1,200\.00/)).toBeInTheDocument();
    expect(screen.getByText(/Open:\s*\$950\.00/)).toBeInTheDocument();

    // Document Total column may still show historical $2,450.00; Open cells for voids are $0.00.
    expect(screen.getByText("$2,450.00")).toBeInTheDocument();
    expect(screen.getAllByText("$0.00").length).toBeGreaterThanOrEqual(2);
  });
});
