import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useSearchParams } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { PartyListSwitch } from "../PartyBoard";
import { ToastProvider } from "../../Toast";

vi.mock("../../../api/client", () => ({
  apiRequest: vi.fn().mockResolvedValue({
    range_from: "2026-01-01",
    kpis: {
      with_transactions: 1,
      in_the_book: 1,
      open_invoices: 0,
      billed_cents: 0,
      ar_open_cents: 0,
      collected_cents: 0,
      invoices: 0,
      invoices_with_payment: 0,
    },
    chips: { with_transactions: 1, open_balance: 0, factored: 0, all: 1 },
    rows: [],
  }),
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, body?: unknown) {
      super("api");
      this.status = status;
      void body;
    }
  },
}));

vi.mock("../VariantDuplicatesPanel", () => ({
  useVariantCandidates: () => ({ data: { pairs: [] } }),
  variantPairsFor: () => [],
  VariantDuplicatesPanel: () => null,
}));

vi.mock("../../customers/CustomerCreateModal", () => ({
  CustomerCreateModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="customers-create-modal-host">Create Customer</div> : null,
}));

vi.mock("../../vendors/VendorCreateModal", () => ({
  VendorCreateModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="vendors-create-modal-host">Create Vendor</div> : null,
}));

function CustomersRouteHarness() {
  const [params, setParams] = useSearchParams();
  const createOpen = params.get("create") === "1";
  const detailActive =
    params.get("view") === "detail" || ["customer", "vendor", "tab", "listTab", "category"].some((k) => params.has(k));
  return (
    <PartyListSwitch
      kind="customers"
      operatingCompanyId="91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071"
      detail={<div data-testid="customers-legacy-detail">LEGACY MASTER DETAIL</div>}
      detailActive={detailActive}
      setDetail={(on) =>
        setParams((prev) => {
          const next = new URLSearchParams(prev);
          if (on) next.set("view", "detail");
          else {
            next.delete("view");
            next.delete("create");
          }
          return next;
        })
      }
      createOpen={createOpen}
      onCloseCreate={() =>
        setParams((prev) => {
          const next = new URLSearchParams(prev);
          next.delete("create");
          next.delete("view");
          return next;
        })
      }
      onCreate={() =>
        setParams((prev) => {
          const next = new URLSearchParams(prev);
          next.delete("view");
          next.set("create", "1");
          return next;
        })
      }
    />
  );
}

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <ToastProvider>
          <Routes>
            <Route path="/customers" element={<CustomersRouteHarness />} />
          </Routes>
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("PartyListSwitch create overlay (boards 9/10)", () => {
  it("keeps approved PartyBoard mounted when create=1 (no legacy master-detail)", async () => {
    renderAt("/customers?chip=factored&create=1");
    expect(await screen.findByTestId("party-board-customers")).toBeTruthy();
    expect(screen.getByTestId("customers-create-modal-host")).toBeTruthy();
    expect(screen.queryByTestId("customers-legacy-detail")).toBeNull();
    expect(screen.queryByTestId("customers-master-detail-shell")).toBeNull();
  });

  it("still mounts legacy detail only when view=detail without create overlay forced", async () => {
    renderAt("/customers?view=detail");
    expect(await screen.findByTestId("customers-legacy-detail")).toBeTruthy();
    expect(screen.queryByTestId("party-board-customers")).toBeNull();
  });
});
