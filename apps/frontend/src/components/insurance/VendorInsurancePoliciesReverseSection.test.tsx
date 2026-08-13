import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { VendorInsurancePoliciesReverseSection } from "./VendorInsurancePoliciesReverseSection";

const listInsurancePolicies = vi.fn().mockResolvedValue({ policies: [{ id: "policy-1", policy_number: "POL-100", coverage_type: "auto_liability", expiry_date: "2027-01-31" }] });
vi.mock("../../api/insurance", () => ({ listInsurancePolicies: (...args: unknown[]) => listInsurancePolicies(...args) }));

describe("VendorInsurancePoliciesReverseSection", () => {
  it("queries the exact vendor FK and drills to policy detail", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter><VendorInsurancePoliciesReverseSection operatingCompanyId="usmca" vendorId="vendor-1" /></MemoryRouter></QueryClientProvider>);
    expect(await screen.findByRole("link", { name: "POL-100" })).toHaveAttribute("href", "/safety/insurance/policies/policy-1");
    expect(listInsurancePolicies).toHaveBeenCalledWith({ operating_company_id: "usmca", vendor_id: "vendor-1" });
  });
});
