import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NeedsDeliveryAuthorizationPage } from "../NeedsDeliveryAuthorizationPage";

vi.mock("../../../api/dispatch", () => ({
  listNeedsDeliveryAuthorization: vi.fn(async () => ({
    operating_company_id: "5c854333-6ea5-4faa-af31-67cb272fef80",
    waiting_for: "delivery_authorization",
    count: 2,
    rows: [
      {
        load_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        load_number: "13625",
        status: "dispatched",
        customer_name: "LOGIMAX TRANSPORT INC",
        invoice_display_id: "INV-2026-00010",
        invoice_status: "sent",
        factoring_status: null,
      },
      {
        load_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        load_number: "13626",
        status: "dispatched",
        customer_name: "FLS TRANSPORTATION SERVICES LIMITED",
        invoice_display_id: "INV-2026-00011",
        invoice_status: "sent",
        factoring_status: "pending",
      },
    ],
  })),
  createManualDeliveryAuthorization: vi.fn(),
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

vi.mock("../../../components/Toast", () => ({
  useToast: () => ({ pushToast: vi.fn() }),
}));

vi.mock("../../../components/dispatch/DispatchSubnav", () => ({
  DispatchSubnav: () => <div data-testid="dispatch-queues-subnav-stub" />,
}));

describe("NeedsDeliveryAuthorizationPage (ROUND 292)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function wrap() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <NeedsDeliveryAuthorizationPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it("renders the named queue page and table", async () => {
    wrap();
    expect(await screen.findByTestId("needs-delivery-authorization-page")).toBeTruthy();
    expect(screen.getByTestId("needs-delivery-authorization-table")).toBeTruthy();
    expect(await screen.findByText("13625")).toBeTruthy();
    expect(screen.getByText("13626")).toBeTruthy();
    expect(screen.getByTestId("needs-delivery-authorization-count").textContent).toMatch(
      /2 loads need delivery authorization/,
    );
  });
});
