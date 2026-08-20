import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as namesApi from "../../../../api/namesMaster";
import { NamesMasterHub } from "../NamesMasterHub";

const navigateMock = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock("../../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }),
}));

describe("NamesMasterHub", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    navigateMock.mockReset();
    vi.spyOn(namesApi, "getNamesMasterCounts").mockResolvedValue({
      customers: 1,
      vendors: 1,
      drivers: 1,
      contacts: 1,
      total: 4,
    });
    vi.spyOn(namesApi, "searchNamesMaster").mockResolvedValue({
      rows: [
        {
          entity_type: "customer",
          entity_id: "11111111-1111-4111-8111-111111111111",
          display_name: "Acme",
          primary_email: null,
          primary_phone: null,
          link_to_module_page: "/customers/11111111-1111-4111-8111-111111111111",
          qbo_id: null,
          archived_at: null,
        },
      ],
      total: 1,
      limit: 50,
      offset: 0,
    });
  });

  function renderHub() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <NamesMasterHub />
        </MemoryRouter>
      </QueryClientProvider>
    );
  }

  it("search input triggers API call with q parameter", async () => {
    renderHub();
    fireEvent.change(screen.getByPlaceholderText(/Name, email/i), { target: { value: "Acme" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => {
      expect(namesApi.searchNamesMaster).toHaveBeenCalledWith(
        expect.objectContaining({ q: "Acme" })
      );
    });
  });

  it("Open navigates to canonical module page", async () => {
    renderHub();
    await waitFor(() => expect(screen.getByRole("button", { name: "Open" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(navigateMock).toHaveBeenCalledWith("/customers/11111111-1111-4111-8111-111111111111");
  });

  it("does not build a customer detail drill from an unlinked QBO mirror id", async () => {
    vi.mocked(namesApi.searchNamesMaster).mockResolvedValueOnce({
      rows: [
        {
          entity_type: "customer",
          entity_id: "22222222-2222-4222-8222-222222222222",
          display_name: "QBO-only Broker",
          primary_email: null,
          primary_phone: null,
          link_to_module_page: "/accounting/customers",
          qbo_id: "qbo-123",
          archived_at: null,
        },
      ],
      total: 1,
      limit: 50,
      offset: 0,
    });

    renderHub();
    await waitFor(() => expect(screen.getByTestId("names-master-noncanonical-record")).toHaveTextContent("QBO-only Broker"));
    expect(screen.queryByTestId("names-master-record-link")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(navigateMock).toHaveBeenCalledWith("/accounting/customers");
  });

  it("keeps an unresolved identity and its Open action noninteractive", async () => {
    vi.mocked(namesApi.searchNamesMaster).mockResolvedValueOnce({
      rows: [
        {
          entity_type: "driver",
          entity_id: "33333333-3333-4333-8333-333333333333",
          display_name: "",
          primary_email: null,
          primary_phone: null,
          link_to_module_page: "/drivers/33333333-3333-4333-8333-333333333333",
          qbo_id: null,
          archived_at: null,
        },
      ],
      total: 1,
      limit: 50,
      offset: 0,
    });

    renderHub();
    await waitFor(() => expect(screen.getByTestId("names-master-record-tombstone")).toBeInTheDocument());
    expect(screen.getByTestId("names-master-open-tombstone")).toHaveTextContent("Unavailable");
    expect(screen.queryByRole("button", { name: "Open" })).not.toBeInTheDocument();
  });
});
