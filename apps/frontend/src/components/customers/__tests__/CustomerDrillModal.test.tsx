import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Customer } from "../../../api/mdata";
import { CustomerDrillModal } from "../CustomerDrillModal";

const sampleCustomer = {
  id: "cust-1",
  operating_company_id: "oc-1",
  name: "Acme Freight",
  customer_code: "ACME",
  email: "billing@acme.test",
  phone: "555-0100",
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
      <CustomerDrillModal open customer={sampleCustomer} openBalanceCents={12500} overdueCents={500} onClose={vi.fn()} />
    </QueryClientProvider>
  );
}

describe("CustomerDrillModal", () => {
  it("renders exactly one h2 element (Modal title only, no doubled header)", () => {
    renderModal();
    expect(document.body.querySelectorAll("h2")).toHaveLength(1);
  });
});
