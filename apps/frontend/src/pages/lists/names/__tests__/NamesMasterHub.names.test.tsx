import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import * as namesApi from "../../../../api/namesMaster";
import { NamesMasterHub, namesMasterLabel } from "../NamesMasterHub";

vi.mock("../../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }),
}));

const row = (entity_type: string, display_name: string, id: string) => ({
  entity_type,
  entity_id: id,
  display_name,
  primary_email: null,
  primary_phone: null,
  link_to_module_page: `/${entity_type}s/${id}`,
  qbo_id: null,
  archived_at: null,
});

describe("Names Master Name column (row 229 / D053)", () => {
  it("renders HUGO GAYTAN → Hugo Gaytan and ACME FREIGHT LLC → Acme Freight LLC", async () => {
    vi.spyOn(namesApi, "getNamesMasterCounts").mockResolvedValue({ customers: 1, vendors: 0, drivers: 1, contacts: 1, total: 3 });
    vi.spyOn(namesApi, "searchNamesMaster").mockResolvedValue({
      rows: [
        row("driver", "HUGO GAYTAN", "11111111-1111-4111-8111-111111111111"),
        row("customer", "ACME FREIGHT LLC", "22222222-2222-4222-8222-222222222222"),
        row("contact", "MARIA LOPEZ", "33333333-3333-4333-8333-333333333333"),
      ] as never,
      total: 3,
      limit: 50,
      offset: 0,
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <NamesMasterHub />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByText("Hugo Gaytan")).toBeInTheDocument();
    expect(screen.getByText("Acme Freight LLC")).toBeInTheDocument();
    expect(screen.getByText("Maria Lopez")).toBeInTheDocument();
    expect(screen.queryByText("HUGO GAYTAN")).toBeNull();
  });

  it("keeps the honest fallback for a missing name", () => {
    expect(namesMasterLabel({ entity_type: "vendor", display_name: "", entity_id: "44444444-4444-4444-8444-444444444444" } as never, "Vendor")).toBe(
      "Vendor — not visible",
    );
  });
});
