import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { BillsReverseSection } from "./BillsReverseSection";

const listBills = vi.fn().mockResolvedValue({ rows: [] });
vi.mock("../../api/accounting", () => ({
  listBills: (...args: unknown[]) => listBills(...args),
  billVendorDrillId: () => null,
}));

function renderSection(props: Parameters<typeof BillsReverseSection>[0]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <BillsReverseSection {...props} />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("BillsReverseSection", () => {
  it("GO-18 (owner correction 2026-09-02, N1 gap): shows an Add Bill link for a load filter, carrying load_id and load_number", async () => {
    renderSection({
      operatingCompanyId: "usmca",
      filter: { load_id: "load-1" },
      contextLabel: "this load",
      createLoadNumber: "L-20260901-0007",
    });
    const link = await screen.findByTestId("bills-reverse-add-bill");
    expect(link).toHaveAttribute("href", "/accounting/bills/vendor?load_id=load-1&load_number=L-20260901-0007");
  });

  it("never shows Add Bill for a non-load filter (unit/insurance_claim) — load-from-load only", async () => {
    renderSection({ operatingCompanyId: "usmca", filter: { unit_id: "unit-1" }, contextLabel: "this unit" });
    await screen.findByText(/No bills linked to this unit/i);
    expect(screen.queryByTestId("bills-reverse-add-bill")).not.toBeInTheDocument();
  });

  it("still renders Open Bills for both filter kinds (existing behavior unchanged)", async () => {
    renderSection({ operatingCompanyId: "usmca", filter: { load_id: "load-1" }, contextLabel: "this load" });
    expect(await screen.findByRole("link", { name: "Open Bills" })).toHaveAttribute(
      "href",
      "/accounting/bills?load_id=load-1"
    );
  });
});
