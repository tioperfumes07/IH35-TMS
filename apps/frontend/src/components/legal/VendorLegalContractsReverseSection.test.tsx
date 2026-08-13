import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { VendorLegalContractsReverseSection } from "./VendorLegalContractsReverseSection";

const listContracts = vi.fn().mockResolvedValue({
  contracts: [{
    id: "contract-1",
    template_code: "vendor_nda",
    display_name_en: "Vendor NDA",
    status: "draft",
    signer_name: "Acme Repair",
  }],
});

vi.mock("../../api/legal-contracts", () => ({
  legalContractsApi: { list: (...args: unknown[]) => listContracts(...args) },
}));

describe("VendorLegalContractsReverseSection", () => {
  it("queries the exact vendor signer FK and drills to the selected contract", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <VendorLegalContractsReverseSection operatingCompanyId="usmca" vendorId="vendor-1" />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("link", { name: "Vendor NDA" })).toHaveAttribute("href", "/legal/contracts?contract_id=contract-1");
    expect(listContracts).toHaveBeenCalledWith({
      operating_company_id: "usmca",
      signer_type: "vendor",
      signer_entity_id: "vendor-1",
    });
  });
});
