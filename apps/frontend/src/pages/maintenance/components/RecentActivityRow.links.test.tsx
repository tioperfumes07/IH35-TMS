import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { WorkOrder } from "../../../api/maintenance";
import { RecentActivityRow } from "./RecentActivityRow";

describe("Maintenance Home recent activity source links", () => {
  it("exposes create and separate all/completed destinations", () => {
    render(<MemoryRouter><RecentActivityRow recent={[]} completed={[]} recentTotalCount={0} completedTotalCount={0}
      pageSize={25} recentPage={0} completedPage={0} fetching={false}
      onRecentPageChange={vi.fn()} onCompletedPageChange={vi.fn()} onOpen={vi.fn()} /></MemoryRouter>);
    expect(screen.getByRole("link", { name: "+ Create Work Order" })).toHaveAttribute("href", "/maintenance?create_wo=1");
    expect(screen.getAllByRole("link", { name: "View all →" }).map((link) => link.getAttribute("href")))
      .toEqual(["/maintenance/active-wos", "/maintenance/active-wos?status=complete"]);
  });

  it("opens the exact completed work order from its cost", () => {
    const onOpen = vi.fn();
    const row = { id: "10000000-0000-4000-8000-000000000001", display_id: "WO-TEST", total_actual_cost: 125.5,
      status: "complete", closed_at: "2026-10-22", duration_seconds: 3600 } as unknown as WorkOrder;
    render(<MemoryRouter><RecentActivityRow recent={[]} completed={[row]} recentTotalCount={0} completedTotalCount={1}
      pageSize={25} recentPage={0} completedPage={0} fetching={false}
      onRecentPageChange={vi.fn()} onCompletedPageChange={vi.fn()} onOpen={onOpen} /></MemoryRouter>);
    fireEvent.click(screen.getByRole("link", { name: "$125.50" }));
    expect(onOpen).toHaveBeenCalledWith(row.id);
  });
});
