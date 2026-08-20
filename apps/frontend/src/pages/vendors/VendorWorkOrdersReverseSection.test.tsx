import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VendorWorkOrdersReverseSection } from "./VendorWorkOrdersReverseSection";

const listWorkOrdersFiltered = vi.fn();

vi.mock("../../api/maintenance", () => ({
  listWorkOrdersFiltered: (...args: unknown[]) => listWorkOrdersFiltered(...args),
}));

describe("VendorWorkOrdersReverseSection", () => {
  beforeEach(() => {
    listWorkOrdersFiltered.mockReset();
    listWorkOrdersFiltered.mockResolvedValue({
      work_orders: [{
        id: "wo-1",
        display_id: "WO-T120-RS-0002",
        // EntityLinkOrTombstone renders the honest "—" tombstone the moment `id` is missing,
        // regardless of `name` (LV-SAFETY-ENTITYLINK-UNRESOLVED-TOMBSTONE — never imply a drill-
        // through link exists without a real id to drill to). unit_id was missing from this fixture.
        unit_id: "unit-1",
        unit_number: "T120",
        status: "open",
        opened_at: "2026-08-08T12:00:00Z",
      }],
      total_count: 1,
    });
  });

  it("scopes by canonical vendor id and links the live work order back to maintenance", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <VendorWorkOrdersReverseSection operatingCompanyId="usmca" vendorId="vendor-1" />
        </MemoryRouter>
      </QueryClientProvider>
    );

    const link = await screen.findByRole("link", { name: "WO-T120-RS-0002" });
    expect(link.getAttribute("href")).toBe("/maintenance/work-orders/wo-1");
    expect(listWorkOrdersFiltered).toHaveBeenCalledWith("usmca", { external_vendor_id: "vendor-1" });
    // T120 is now its own real EntityLinkOrTombstone link (drills to /fleet/units/:id), not plain
    // text sharing a node with "open" — assert the unit link and the status text separately.
    const unitLink = screen.getByRole("link", { name: "T120" });
    expect(unitLink.getAttribute("href")).toBe("/fleet/units/unit-1");
    expect(screen.getByText(/open · 08\/08\/2026/)).toBeTruthy();
  });
});
