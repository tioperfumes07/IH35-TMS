import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VendorPreferredPartsReverseSection } from "./VendorPreferredPartsReverseSection";

const listMaintenanceParts = vi.fn();
vi.mock("../../api/maintenance", () => ({
  listMaintenanceParts: (...args: unknown[]) => listMaintenanceParts(...args),
}));

describe("VendorPreferredPartsReverseSection", () => {
  beforeEach(() => {
    listMaintenanceParts.mockReset();
    listMaintenanceParts.mockResolvedValue({
      rows: [{ id: "part-1", name: "Oil filter", part_number: "OF-1", qty_on_hand: 12 }],
    });
  });

  it("queries the exact vendor FK and deep-links the canonical inventory part", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <VendorPreferredPartsReverseSection operatingCompanyId="usmca" vendorId="vendor-1" />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const link = await screen.findByRole("link", { name: "Oil filter" });
    expect(link.getAttribute("href")).toBe("/inventory?part_id=part-1");
    expect(listMaintenanceParts).toHaveBeenCalledWith("usmca", { vendor_id: "vendor-1" });
    expect(screen.getByText(/OF-1 · on hand 12/)).toBeTruthy();
  });
});
