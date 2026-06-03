import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Customer } from "../../../api/mdata";
import { CustomerEditModal } from "../CustomerEditModal";

const sampleCustomer = {
  id: "cust-1",
  operating_company_id: "oc-1",
  name: "Acme Freight",
  customer_code: "ACME",
  email: "billing@acme.test",
  phone: "555-0100",
  dot_number: "123456",
  mc_number: "MC-99",
  tax_id: "12-3456789",
  billing_state: "TX",
  status: "active",
  quality_overall_flag: "standard",
  factoring_eligible: false,
  free_time_pickup_minutes: 120,
  free_time_delivery_minutes: 120,
  detention_rate_per_hour: "0",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
} as Customer;

function renderModal() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CustomerEditModal open customer={sampleCustomer} onClose={vi.fn()} onSave={vi.fn()} />
    </QueryClientProvider>
  );
}

describe("CustomerEditModal", () => {
  it("renders no input without a name attribute", () => {
    renderModal();
    const inputs = document.body.querySelectorAll("input");
    expect(inputs.length).toBeGreaterThan(0);
    for (const input of inputs) {
      expect(input.getAttribute("name"), `unnamed input: ${input.outerHTML.slice(0, 120)}`).toBeTruthy();
    }
  });
});
