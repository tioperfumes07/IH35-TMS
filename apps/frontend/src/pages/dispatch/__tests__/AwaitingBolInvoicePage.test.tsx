import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AwaitingBolInvoicePage } from "../AwaitingBolInvoicePage";

vi.mock("../../../api/dispatch", () => ({
  listAwaitingBolInvoice: vi.fn(async () => ({
    operating_company_id: "5c854333-6ea5-4faa-af31-67cb272fef80",
    waiting_for: "BOL",
    count: 3,
    rows: [
      {
        load_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        load_number: "13626",
        status: "completed_docs_received",
        customer_name: "FLS TRANSPORTATION SERVICES LIMITED",
        waiting_for: "BOL",
        has_invoice: true,
      },
      {
        load_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        load_number: "13625",
        status: "completed_docs_received",
        customer_name: "LOGIMAX TRANSPORT INC",
        waiting_for: "BOL",
        has_invoice: true,
      },
      {
        load_id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
        load_number: "13615",
        status: "completed_docs_received",
        customer_name: "Semares Forwarding Services",
        waiting_for: "BOL",
        has_invoice: true,
      },
    ],
  })),
}));

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "5c854333-6ea5-4faa-af31-67cb272fef80" }),
}));

vi.mock("../../../components/shared/EntityLinkOrTombstone", () => ({
  EntityLinkOrTombstone: ({ name }: { name?: string | null }) => <span>{name ?? "—"}</span>,
}));

vi.mock("../../../components/StatusBadge", () => ({
  StatusBadge: ({ status }: { status: string }) => <span>{status}</span>,
}));

describe("AwaitingBolInvoicePage (285.4.10 / #60)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function wrap() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <AwaitingBolInvoicePage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it("renders the named queue page and table", async () => {
    wrap();
    expect(await screen.findByTestId("awaiting-bol-invoice-page")).toBeTruthy();
    expect(screen.getByTestId("awaiting-bol-invoice-table")).toBeTruthy();
    expect(await screen.findByText("13626")).toBeTruthy();
    expect(screen.getByText("13625")).toBeTruthy();
    expect(screen.getByText("13615")).toBeTruthy();
    expect(screen.getByTestId("awaiting-bol-invoice-count").textContent).toMatch(/3 loads waiting for BOL/);
  });
});
